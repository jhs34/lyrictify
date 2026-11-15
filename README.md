# Lyrictify — Apple Music Style Lyric Viewer

Spotify에서 현재 재생 중인 곡을 실시간으로 감지하고 **LRCLIB**에서 싱크 가사(Synced LRC) 또는 일반 가사를 불러와 Apple Music 스타일의 웨이브 스크롤과 거리별 블러 애니메이션으로 보여주는 웹 애플리케이션입니다.

## 주요 기능

- **Apple Music 스타일 가사 뷰어**: 현재 소절 기준 거리별 블러(Progressive Blur), 줄 간 시간차 웨이브 이동(`cubic-bezier(0.16, 1, 0.3, 1)`), 가사 클릭 시 해당 구간 즉시 이동(Seek)
- **수동 스크롤 & 자동 복귀**: 마우스 휠 또는 터치 드래그 시 블러가 일시 해제되며 자유롭게 탐색하고, 3초 후 현재 재생 위치로 부드럽게 복귀
- **실시간 투명 UI 조절 모달**: 슬라이더를 드래그하는 동안 모달 배경이 투명해지며 글씨 크기, 가사 높이, 블러 강도, 이동 속도, 시간차, 줄/문단 간격, 싱크 오프셋(ms) 등을 실시간으로 확인하며 조정
- **화면 항상 켜기 (Wake Lock) & 전체화면**: 모바일·태블릿 거치용 화면 꺼짐 방지 및 미디어 컨트롤러 크기 조절/숨기기 지원
- **UI 미리보기 모드**: Spotify API 키 없이도 모든 애니메이션과 설정 기능을 즉시 테스트 가능

## 로컬 개발 실행

```bash
npm install
npm run dev
```

유닛 테스트 및 프로덕션 빌드 검증:

```bash
npx --yes tsx --test src/utils/lyrics.test.ts
npm run build
```

## GitHub Pages 배포 방법 (GitHub Actions)

이 프로젝트에는 `.github/workflows/deploy.yml` 워크플로우와 상대 경로 빌드 설정(`vite.config.ts`의 `base: './'`)이 포함되어 있어 별도 서버 없이 GitHub Pages에 바로 배포할 수 있습니다.

1. 이 프로젝트를 본인의 GitHub 저장소(`main` 또는 `master` 브랜치)에 푸시합니다.
2. GitHub 저장소 상단 메뉴에서 **Settings** → 좌측 **Pages**로 이동합니다.
3. **Build and deployment** 섹션의 **Source**를 **`GitHub Actions`**로 변경합니다.
4. 코드를 푸시하거나 **Actions** 탭에서 `Deploy Lyrictify to GitHub Pages` 워크플로우의 **Run workflow**를 실행하면 자동으로 빌드 및 배포가 완료됩니다.
