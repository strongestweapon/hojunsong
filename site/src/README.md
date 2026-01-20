# Hojun Song Site - Build System

## 폴더 구조

```
site/
├── src/
│   ├── build.js              # 빌드 스크립트
│   ├── content/
│   │   └── works/
│   │       └── [slug]/
│   │           ├── [slug].md         # 작업 메인 파일
│   │           ├── _images/          # 작업 이미지
│   │           └── [sub-slug]/       # 세부 프로젝트 (선택)
│   │               ├── [sub-slug].md
│   │               └── (이미지들)
│   └── README.md             # 이 파일
└── public/                   # 빌드 결과물 (S3에 업로드)
    ├── index.html
    ├── css/style.css
    ├── data/works.json
    └── works/
```

## MD 파일 형식

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

## 빌드 명령어

```bash
cd /Users/hojunsong/Documents/Github/hojunsong/site
node src/build.js
```

## 이미지 규칙

- 작업 이미지: `src/content/works/[slug]/_images/` 폴더에
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

## S3 배포

1. `node src/build.js` 실행
2. `public/` 폴더 **안의 내용물**을 S3 버킷에 업로드
   - public 폴더 자체가 아니라 그 안의 파일들

## 세부 프로젝트 (Presentations)

작업 폴더 안에 하위 폴더로 생성:

```
dont-compress-me/
├── dont-compress-me.md
├── _images/
└── 2013-seoul-mmca/
    ├── 2013-seoul-mmca.md
    └── (이미지들)
```

세부 프로젝트 MD 형식:
```yaml
---
slug: 2013-seoul-mmca
title: Don't Compress Me
type: Installation
location: MMCA Seoul
year: 2013
description: 짧은 설명
---

## Overview
내용

## Context
내용

## Credits
내용
```
