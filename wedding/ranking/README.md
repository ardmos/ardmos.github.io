# 관리용 랭킹 뷰어 (청첩장과 링크되지 않음)

- live.html — 실시간 (클라이언트에서 rankings 공개 읽기)
- 0900.html / 1000.html / 1100.html — 당일 해당 시각 스냅샷
- capture.ps1 — 스냅샷 생성·커밋·푸시 (예약 작업에서 호출)

검색 제외: 각 페이지 noindex + 루트 robots.txt Disallow.