/**
 * 레거시 랭킹(rankings/{phoneHash}) 1회성 마이그레이션 스크립트 (선택 사항, 관리자 PC에서만 실행)
 * -------------------------------------------------------------------------------------------
 * 하는 일
 *   1) backup   : rankings 전체를 로컬 JSON으로 백업 (전화번호 포함 → 저장소에 커밋 금지!)
 *   2) migrate  : 각 레거시 문서를
 *                  - 같은 전화번호로 새 시스템(contacts/{uid})에 등록된 사람이 있으면
 *                    scores/{uid} 에 병합 (bestScore=max, playCount 합산)
 *                  - 없으면 legacy_scores/{랜덤ID} 로 전화번호 없이 복사
 *                 전화번호 ↔ 랜덤ID 대응표는 legacy_private/{phoneHash} (규칙상 클라이언트 접근 불가)에 저장.
 *                 --delete-legacy 를 주면 처리 완료된 rankings 문서를 삭제합니다.
 *   3) merge    : 이후 legacy_scores 로만 남은 사람이 새 시스템에서 플레이하면(contacts 생김)
 *                 다시 실행해 scores/{uid} 로 병합하고 legacy_scores 행을 지웁니다. (반복 실행 안전)
 *
 * 준비
 *   npm i firebase-admin   (이 폴더 밖, 예: 임시 폴더에서)
 *   Firebase 콘솔 > 프로젝트 설정 > 서비스 계정 > 새 비공개 키 생성 → JSON 파일 (절대 커밋/공유 금지)
 *   PowerShell:  $env:GOOGLE_APPLICATION_CREDENTIALS="C:\secure\sa.json"
 *
 * 실행 (기본은 dry-run: 아무것도 쓰지 않고 할 일만 출력)
 *   node migrate-legacy-rankings.mjs backup  --out C:\secure\rankings-backup.json
 *   node migrate-legacy-rankings.mjs migrate                 # dry-run
 *   node migrate-legacy-rankings.mjs migrate --apply
 *   node migrate-legacy-rankings.mjs migrate --apply --delete-legacy
 *   node migrate-legacy-rankings.mjs merge --apply
 */
import { writeFileSync } from 'node:fs';
import admin from 'firebase-admin';

const args = process.argv.slice(2);
const cmd = args[0];
const APPLY = args.includes('--apply');
const DELETE_LEGACY = args.includes('--delete-legacy');
const outIdx = args.indexOf('--out');
const OUT = outIdx >= 0 ? args[outIdx + 1] : null;

admin.initializeApp({ credential: admin.credential.applicationDefault() });
const db = admin.firestore();
const { Timestamp, FieldValue } = admin.firestore;

function toTs(v){
  if (v instanceof Timestamp) return v;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Timestamp.fromMillis(n) : Timestamp.now();
}
function toInt(v){ const n = Math.floor(Number(v)); return Number.isFinite(n) && n > 0 ? n : 0; }
const log = (...a) => console.log(APPLY ? '[APPLY]' : '[DRY-RUN]', ...a);

// 전화번호 → 가장 최근에 갱신된 새 시스템 uid
async function uidByPhone(){
  const map = new Map();
  const snap = await db.collection('contacts').get();
  snap.forEach(d => {
    const c = d.data();
    if (!c.phoneNumber) return;
    const prev = map.get(c.phoneNumber);
    const t = c.updatedAt ? c.updatedAt.toMillis() : 0;
    if (!prev || t > prev.t) map.set(c.phoneNumber, { uid: d.id, t });
  });
  return map;
}

// 레거시 기록을 scores/{uid} 에 병합 (트랜잭션)
async function mergeIntoScores(uid, legacy){
  const ref = db.collection('scores').doc(uid);
  if (!APPLY){ log(`merge -> scores/${uid}`, legacy.nickname, legacy.bestScore); return; }
  await db.runTransaction(async tx => {
    const doc = await tx.get(ref);
    if (!doc.exists) throw new Error(`scores/${uid} 없음`);
    const cur = doc.data();
    const legacyBetter = legacy.bestScore > toInt(cur.bestScore);
    tx.update(ref, {
      bestScore: legacyBetter ? legacy.bestScore : toInt(cur.bestScore),
      bestScoreAt: legacyBetter ? legacy.bestScoreAt : cur.bestScoreAt,
      playCount: toInt(cur.playCount) + legacy.playCount
    });
  });
  log(`merged -> scores/${uid}`, legacy.nickname, legacy.bestScore);
}

async function backup(){
  if (!OUT){ console.error('--out <경로> 필요 (저장소 밖 안전한 위치)'); process.exit(1); }
  const snap = await db.collection('rankings').get();
  const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  writeFileSync(OUT, JSON.stringify(rows, null, 2), 'utf8');
  console.log(`백업 완료: ${rows.length}건 -> ${OUT}`);
}

async function migrate(){
  const phones = await uidByPhone();
  const snap = await db.collection('rankings').get();
  let merged = 0, copied = 0, skipped = 0;
  for (const d of snap.docs){
    const r = d.data();
    const priv = db.collection('legacy_private').doc(d.id);
    const privDoc = await priv.get();
    if (privDoc.exists){ skipped++; if (APPLY && DELETE_LEGACY) await d.ref.delete(); continue; }
    const legacy = {
      nickname: String(r.nickname || '').slice(0, 10) || '하객',
      bestScore: toInt(r.bestScore),
      bestScoreAt: toTs(r.bestScoreAt),
      playCount: toInt(r.playCount)
    };
    const hit = r.phoneNumber ? phones.get(r.phoneNumber) : null;
    const scoreDoc = hit ? await db.collection('scores').doc(hit.uid).get() : null;
    if (hit && scoreDoc.exists){
      await mergeIntoScores(hit.uid, legacy);
      if (APPLY) await priv.set({ phoneNumber: r.phoneNumber || null, mergedInto: hit.uid, legacyScoreId: null, at: FieldValue.serverTimestamp() });
      merged++;
    } else {
      const copyRef = db.collection('legacy_scores').doc(); // 랜덤 ID (전화번호 유추 불가)
      log(`copy -> legacy_scores/${copyRef.id}`, legacy.nickname, legacy.bestScore);
      if (APPLY){
        const batch = db.batch();
        batch.set(copyRef, legacy);
        batch.set(priv, { phoneNumber: r.phoneNumber || null, mergedInto: null, legacyScoreId: copyRef.id, at: FieldValue.serverTimestamp() });
        await batch.commit();
      }
      copied++;
    }
    if (APPLY && DELETE_LEGACY) await d.ref.delete();
  }
  console.log(`완료: 병합 ${merged}, 사본 ${copied}, 이미 처리됨 ${skipped}${DELETE_LEGACY ? ' (rankings 삭제)' : ''}`);
}

async function mergeLater(){
  const phones = await uidByPhone();
  const snap = await db.collection('legacy_private').where('mergedInto', '==', null).get();
  let n = 0;
  for (const p of snap.docs){
    const { phoneNumber, legacyScoreId } = p.data();
    const hit = phoneNumber ? phones.get(phoneNumber) : null;
    if (!hit || !legacyScoreId) continue;
    const [scoreDoc, legDoc] = await Promise.all([
      db.collection('scores').doc(hit.uid).get(),
      db.collection('legacy_scores').doc(legacyScoreId).get()
    ]);
    if (!scoreDoc.exists || !legDoc.exists) continue;
    const l = legDoc.data();
    await mergeIntoScores(hit.uid, { ...l, bestScore: toInt(l.bestScore), playCount: toInt(l.playCount) });
    if (APPLY){
      await legDoc.ref.delete();
      await p.ref.update({ mergedInto: hit.uid, legacyScoreId: null });
    }
    n++;
  }
  console.log(`추가 병합: ${n}건`);
}

const run = { backup, migrate, merge: mergeLater }[cmd];
if (!run){ console.error('사용법: backup --out <file> | migrate [--apply] [--delete-legacy] | merge [--apply]'); process.exit(1); }
run().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
