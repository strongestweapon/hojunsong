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
│   │   │       ├── _images/          # 작업 이미지
│   │   │       └── [sub-slug]/       # 세부 프로젝트 (선택)
│   │   │           ├── [sub-slug].md
│   │   │           └── (이미지들)
│   │   ├── projects/
│   │   │   └── [slug]/
│   │   │       ├── [slug].md         # 프로젝트 메인 파일
│   │   │       └── _images/          # 프로젝트 이미지
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

- 작업/프로젝트 이미지: `src/content/[works|projects]/[slug]/_images/` 폴더에
- 파일명 순서: 숫자 prefix로 정렬 (`01-name.jpg`, `02-name.jpg`)
- 캡션: 파일명에서 자동 생성 (숫자 prefix 제거됨)
  - `01-installation-view.jpg` → "Installation view"
- 사이즈: 원본 유지, CSS에서 max-width: 100%로 표시

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
├── _images/
└── 2025-UnfoldX/
    ├── 2025-UnfoldX.md
    └── _images/          # 세부 프로젝트 이미지
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

[images]

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

### 이미지 위치 지정
```markdown
[images]
```
- `_images/` 폴더의 이미지들이 이 위치에 표시됨
- `[images]` 없으면 Overview 끝에 자동 추가

### 비디오 임베드
```markdown
[youtube](https://www.youtube.com/watch?v=VIDEO_ID)
[youtube](https://youtu.be/VIDEO_ID)
[vimeo](https://vimeo.com/VIDEO_ID)
```

### 반복 비디오 (GIF 대체)
```markdown
[loop](video.mp4)
```
- 자동재생, 반복, 음소거
- `_images/` 폴더에 mp4 파일 넣고 사용

### 링크
```markdown
[링크 텍스트](https://example.com)
```
- 외부 링크 (`http://`, `https://`)는 자동으로 새 탭에서 열림
- 내부 링크 (`/works/...`, `../`)는 같은 탭에서 열림

### 인라인 이미지 (마크다운 본문에 직접)
```markdown
![캡션](image.jpg)
```
