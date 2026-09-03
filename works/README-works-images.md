# Works 섹션 이미지 가이드

Works(포트폴리오) 섹션에 들어가는 이미지는 전부 `works` 폴더 안에 넣으면 자동으로 반영돼요.

```
index.html
style.css
Worksempty.png   ← 원래 있던 파일, 그대로 두세요
works/           ← 새로 만드는 폴더
  works1-thumb.jpg
  works1-detail1.jpg
  works1-detail2.jpg
  works2-thumb.jpg
  ...
```

**파일명 규칙은 카드가 화면에 보이는 순서 그대로예요.** 첫 번째 카드가 `works1`, 두 번째 카드가 `works2`... 이런 식이라 프로젝트 이름이 바뀌거나 내용이 교체돼도 헷갈릴 일이 없어요. 지금은 이렇게 배정되어 있어요.

**확장자는 `.jpg`든 `.png`든 상관없어요.** 파일명(예: `works1-thumb`)만 규칙대로 맞추면, `.jpg`를 먼저 찾아보고 없으면 자동으로 `.png`를 찾아요. 둘 다 없으면 그때 최종 폴백(썸네일→`Worksempty.png`, 디테일→칸 숨김)으로 넘어가요. 그러니 `.jpg`와 `.png`를 신경 써서 구분할 필요 없이, 갖고 있는 파일 형식 그대로 이름만 맞춰서 넣으면 돼요.

| 순서 | 현재 프로젝트 |
|---|---|
| works1 | 크레인 시뮬레이터 |
| works2 | 건축 시뮬레이터 |
| works3 | 삼성 오프라인 행사용 퀴즈 앱 |
| works4 | 교육용 게임 어플 |
| works5 | 리듬·퍼즐·타이쿤 게임 |
| works6 | 자체 개발중인 게임 |

---

## 1. 썸네일 사진 (카드 목록에 보이는 사진)

Works 섹션에서 스크롤하며 보이는 카드 한 장에 딱 1장만 들어가는 대표 사진이에요.

**규칙: `works숫자-thumb.jpg`**

```
works/works1-thumb.jpg
works/works2-thumb.jpg
works/works3-thumb.jpg
works/works4-thumb.jpg
works/works5-thumb.jpg
works/works6-thumb.jpg
```

이 이름 그대로 파일만 넣으면 끝. 파일이 아직 없으면 자동으로 `Worksempty.png`가 대신 보여요.

---

## 2. 디테일 사진 (상세 보기 눌렀을 때 팝업 안에 보이는 사진)

카드의 "상세 보기" 버튼을 누르면 뜨는 팝업 안에 여러 장 들어갈 수 있는 사진들이에요.

**규칙: `works숫자-detail숫자.jpg`** (뒤 숫자는 1, 2, 3... 순서대로)

```
works/works1-detail1.jpg
works/works1-detail2.jpg
works/works3-detail1.jpg
...
```

파일이 없으면 공개/비공개 상관없이 그 사진 칸이 통째로 사라지고 설명 텍스트만 보여요. 즉 **사진은 실제로 넣은 만큼만 화면에 나타나요.** 1장을 넣든 4장을 넣든 신경 쓸 필요 없이 자동으로 2열 grid에 맞춰 배치돼요 (1장→1칸, 3장→2줄째 1칸만, 4장→2×2 꽉 채움). 코드를 따로 손볼 필요 없어요.

### 디테일 사진을 더 추가하고 싶을 때

`index.html`에서 해당 프로젝트의 모달(`<div id="modal-works1">` 같은 부분)을 찾아서, `work-photos` 안에 있는 사진 블록 하나를 복사해서 붙여넣고 파일명만 다음 번호로 바꾸면 돼요.

```html
<div class="work-photo" data-work="works1">
  <img src="works/works1-detail3.jpg" data-base="works/works1-detail3" alt="상세 이미지" onerror="handleWorkPhotoError(this)">
  <div class="work-photo-lock">
    <span class="work-photo-lock-line1">CONFIDENTIAL</span>
    <span class="work-photo-lock-line2">UNRELEASED PROJECT</span>
  </div>
</div>
```

`src`는 `.jpg` 기준으로 적어두면 되고(없으면 자동으로 `.png`도 찾아봐요), `data-base`는 확장자를 뺀 같은 경로를 그대로 적어주면 돼요.

`data-work="works1"` 부분만 그대로 유지하면, 아래 4번의 공개/비공개 설정이 이 사진에도 자동으로 적용돼요.

---

## 3. 썸네일 vs 디테일 — 헷갈리지 않는 법

- **`-thumb`** = 카드 목록에서 보이는 사진 (1개만)
- **`-detail숫자`** = 팝업 안에서 더 자세히 보여주는 사진 (여러 개 가능)

즉 파일명 끝에 `thumb`가 붙으면 목록용, `detail`이 붙으면 팝업용이라고 기억하면 돼요.

---

## 4. 공개 / 비공개는 한 곳에서만

`index.html`에서 `</footer>` 바로 아래 `<script>` 시작 부분에 이런 설정이 있어요.

```js
var workVisibility = {
  works1: false,  // 크레인 시뮬레이터
  works2: false,  // 건축 시뮬레이터
  works3: true,   // 삼성 오프라인 행사용 퀴즈 앱
  works4: true,   // 교육용 게임 어플
  works5: true,   // 리듬·퍼즐·타이쿤 게임
  works6: false   // 자체 개발중인 게임
};
```

- `false` = 비공개 → 실제로 넣어둔 사진에 한해서, 썸네일 + 팝업 속 사진 + "본 프로젝트는 현재 개발 및 공개 준비 중..." 안내문구까지 한번에 블러/워터마크 처리
- `true` = 공개 → 셋 다 한번에 정상 표시

(사진 파일 자체를 아직 안 넣었다면 공개든 비공개든 그 사진 칸은 그냥 안 보여요 — 블러 처리는 "실제 사진이 있지만 비공개"인 경우에만 나타나요.)

`works1: false` → `works1: true`처럼 값 하나만 바꾸면 그 프로젝트에 속한 모든 사진과 문구가 한 번에 전환돼요. 사진마다 따로 클래스를 찾아다닐 필요 없어요.

---

## 5. 새 프로젝트를 추가하거나 순서를 바꿀 때

- **맨 뒤에 새로 추가**하는 경우: `works7`로 번호만 이어서 붙이면 돼요. (썸네일 카드, 모달, `workVisibility` 설정에 각각 `works7` 추가)
- **기존 프로젝트 내용을 다른 프로젝트로 교체**하는 경우: 번호(`works3` 등)는 그대로 두고 안에 있는 제목/설명/이미지 파일만 바꾸면 돼요. 번호를 새로 매길 필요 없어요.
- **카드 순서 자체를 바꾸고 싶은** 경우에만 번호를 재정렬하면 되는데, 이 경우 `index.html` 안 6곳(모달 id, data-modal, data-work, 이미지 경로, workVisibility 키)을 함께 바꿔야 해서 조금 번거로워요. 순서 변경이 필요하면 말해주면 한번에 정리해줄게요.
