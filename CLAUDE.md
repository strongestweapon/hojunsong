# CLAUDE.md

## 프로젝트 개요
송호준 작가 포트폴리오 웹사이트. 정적 사이트 빌드 시스템.

## 세션 시작 시 반드시 읽을 파일
- `site/src/README.md` - 폴더 구조, MD 형식, 빌드/배포 명령어
- `site/src/grammar.md` - 마크다운 문법 (이미지, 비디오, 그리드 등)

## 자주 쓰는 명령어

### 빌드
```bash
node /Users/hojunsong/Documents/Github/hojunsong/site/src/build.js
```

### 로컬 서버
```bash
cd /Users/hojunsong/Documents/Github/hojunsong/site/public && python3 -m http.server 8000
```
- 백그라운드로 실행할 것

### S3 싱크
```bash
/usr/local/bin/aws s3 sync /Users/hojunsong/Documents/Github/hojunsong/site/public s3://hojunsong-com
```

### CloudFront 인밸리데이션
```bash
/usr/local/bin/aws cloudfront create-invalidation --distribution-id E28EYQUKVHIIRP --paths "/*"
```

### 빌드 + 싱크 + 인밸리 (한번에)
```bash
node /Users/hojunsong/Documents/Github/hojunsong/site/src/build.js && /usr/local/bin/aws s3 sync /Users/hojunsong/Documents/Github/hojunsong/site/public s3://hojunsong-com && /usr/local/bin/aws cloudfront create-invalidation --distribution-id E28EYQUKVHIIRP --paths "/*"
```

## 비디오 변환 (MOV → MP4)

HTML5 재생용 MP4 변환:
```bash
ffmpeg -i input.mov -c:v libx264 -preset medium -crf 23 -c:a aac -movflags +faststart output.mp4
```

포스터 이미지 추출 (첫 프레임):
```bash
ffmpeg -i video.mp4 -ss 00:00:00 -vframes 1 video-poster.jpg
```

- 포스터 파일명: `영상명-poster.jpg` (자동 인식됨)
- 변환 후 반드시 포스터도 함께 생성할 것

## 콘텐츠 구조
- 소스: `site/src/content/works/[slug]/`
- 이미지: `site/src/content/works/[slug]/images/`
- 빌드 결과: `site/public/`

## 작가 프로필
- `hojunsong.md` - 영문 CV/바이오
- `hojunsong_KR.md` - 한글 CV/바이오
