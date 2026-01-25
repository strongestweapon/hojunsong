# Hojun Song Site - Build System

## 폴더 구조

```
site/
├── src/
│   ├── build.js              # 빌드 스크립트
│   ├── content/
│   │   ├── works/
│   │   │   └── [slug]/
│   │   │       ├── [slug].md         # 작업 메인 파일
│   │   │       ├── images/          # 작업 이미지
│   │   │       └── [sub-slug]/       # 세부 프로젝트 (선택)
│   │   │           ├── [sub-slug].md
│   │   │           └── (이미지들)
│   │   ├── projects/
│   │   │   └── [slug]/
│   │   │       ├── [slug].md         # 프로젝트 메인 파일
│   │   │       └── images/          # 프로젝트 이미지
│   │   └── about/
│   │       └── about.md              # 작가 소개
│   └── README.md             # 이 파일
└── public/                   # 빌드 결과물 (S3에 업로드)
    ├── index.html
    ├── css/style.css
    ├── data/
    │   ├── works.json
    │   └── projects.json
    ├── works/
    ├── projects/
    └── about/
```

## MD 파일 형식

### Works (기존 아트 작업)
```yaml
---
slug: work-slug-here        # URL에 사용됨 (필수)
order: 1                    # 홈페이지 순서 (필수, 숫자)
title: Work Title
year: 2020–2022
description: 짧은 설명
relatedProjects:
  - other-work-slug
  - another-work-slug
---

본문 내용. 문단은 빈 줄로 구분.
```

### Projects (게임개발, 기획 등)
```yaml
---
slug: project-slug-here     # URL에 사용됨 (필수)
order: 1                    # 목록 순서 (필수, 숫자)
title: Project Title
year: 2020–2022
description: 짧은 설명
---

본문 내용. 문단은 빈 줄로 구분.
```

### About (작가 소개)
```yaml
---
title: About
---

작가 소개 내용을 직접 작성
```

## 빌드 명령어

```bash
cd /Users/hojunsong/Documents/Github/hojunsong/site
node src/build.js
```

## 이미지 규칙

- 이미지 파일: `src/content/[works|projects]/[slug]/images/` 폴더에 저장
- 마크다운에서 직접 이미지와 캡션 지정 (자동 스캔 없음)
- 이미지 경로는 `images/` 기준 상대 경로 또는 절대 경로
- 이미지가 없으면 404 placeholder 표시 (디버깅용)

## 주요 기능

1. **slug**: frontmatter에서 가져옴 (폴더명 아님)
2. **order**: 겹치면 경고 출력, 알파벳순 fallback
3. **라이센스**: CC BY 4.0
   - JSON/JSON-LD에만 포함
   - HTML에는 표시 안 함
4. **빈 섹션**: 이미지/프레젠테이션 없으면 표시 안 함
5. **네비게이션**: 모든 페이지에 Works | Projects | About 표시

## S3 배포

1. `node src/build.js` 실행
2. `public/` 폴더 안의 내용물을 S3 버킷에 업로드

**캐시 버스팅**: 빌드 시 CSS에 자동으로 버전 번호 추가됨 (`style.css?v=timestamp`)

## 세부 프로젝트 (Presentations) - Works 전용

작업 폴더 안에 하위 폴더로 생성:

```
dont-compress-me/
├── dont-compress-me.md
├── images/
└── 2025-UnfoldX/
    ├── 2025-UnfoldX.md
    └── images/          # 세부 프로젝트 이미지
```

세부 프로젝트 MD 형식:
```yaml
---
slug: 2025-UnfoldX
title: Don't Compress Me
event: Unfold X            # 전시/이벤트 이름 (선택)
type: Installation
location: Culture Station Seoul 284
year: 2025
description: 짧은 설명
---

## Overview
내용

![설치 전경](installation-view.jpg)

[grid-2]
![상세 1](detail-1.jpg)
![상세 2](detail-2.jpg)
[/grid]

[vimeo](https://vimeo.com/12345)

## Context
내용

## Credits
- Credit 1
- Credit 2
```

**event 필드**: 있으면 제목이 "Don't Compress Me: Unfold X"로 표시됨

## 마크다운 문법

### 기본
```markdown
일반 텍스트는 <p> 태그로 변환

## 제목은 <h2>로 변환

- 리스트 아이템 1
- 리스트 아이템 2
```

### 단일 이미지
```markdown
![캡션 텍스트](image.jpg)
```
- `images/` 폴더 기준 상대 경로
- 세로로 나열됨

### 이미지 그리드 (2열)
```markdown
[grid-2]
![캡션1](image1.jpg)
![캡션2](image2.jpg)
![캡션3](image3.jpg)
[/grid]
```

### 이미지 그리드 (3열)
```markdown
[grid-3]
![캡션1](image1.jpg)
![캡션2](image2.jpg)
![캡션3](image3.jpg)
[/grid]
```

### Masonry 레이아웃 (Pinterest 스타일)
```markdown
[masonry]
![캡션1](image1.jpg)
![캡션2](image2.jpg)
![캡션3](image3.jpg)
[/masonry]
```
- 이미지 원본 비율 유지
- 2열 기준, 모바일에서 1열

### 비디오 임베드
```markdown
[youtube](https://www.youtube.com/watch?v=VIDEO_ID)
[youtube](https://youtu.be/VIDEO_ID)
[youtube](https://youtube.com/shorts/VIDEO_ID)
[vimeo](https://vimeo.com/VIDEO_ID)
```

### 반복 비디오 (GIF 대체)
```markdown
[loop](video.mp4)
```
- 자동재생, 반복, 음소거
- `images/` 폴더에 mp4 파일 넣고 사용

### 링크
```markdown
[링크 텍스트](https://example.com)
```
- 외부 링크 (`http://`, `https://`)는 자동으로 새 탭에서 열림
- 내부 링크 (`/works/...`, `../`)는 같은 탭에서 열림
