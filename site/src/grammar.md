# Markdown Grammar

## 기본 텍스트

```markdown
일반 텍스트는 <p> 태그로 변환

## 제목은 <h2>로 변환

- 리스트 아이템 1
- 리스트 아이템 2
```

## 이미지

### 단일 이미지
```markdown
![캡션 텍스트](파일명.jpg)
```
- `images/` 폴더 기준 상대 경로
- 세로로 나열됨

### 2열 그리드
```markdown
[grid-2]
![캡션1](image1.jpg)
![캡션2](image2.jpg)
![캡션3](image3.jpg)
[/grid]
```

### 3열 그리드
```markdown
[grid-3]
![캡션1](image1.jpg)
![캡션2](image2.jpg)
![캡션3](image3.jpg)
[/grid]
```

### Masonry (Pinterest 스타일, 2열)
```markdown
[masonry]
![캡션1](image1.jpg)
![캡션2](image2.jpg)
![캡션3](image3.jpg)
[/masonry]
```
- 이미지 원본 비율 유지
- 모바일에서 1열로 변경

## 비디오

### YouTube
```markdown
[youtube](https://www.youtube.com/watch?v=VIDEO_ID)
[youtube](https://youtu.be/VIDEO_ID)
```

### Vimeo
```markdown
[vimeo](https://vimeo.com/VIDEO_ID)
```

### 반복 비디오 (GIF 대체)
```markdown
[loop](video.mp4)
```
- 자동재생, 반복, 음소거
- `images/` 폴더에 mp4 파일 저장

## 링크

```markdown
[링크 텍스트](https://example.com)
```
- 외부 링크 (`http://`, `https://`): 새 탭에서 열림
- 내부 링크 (`/works/...`, `../`): 같은 탭에서 열림
