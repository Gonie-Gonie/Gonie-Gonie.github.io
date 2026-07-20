# Research Portfolio Site Kit

연구자 한 사람의 구조화된 데이터를 반응형 영문·국문 홈페이지와 CV로 보여 주는 정적 사이트 도구입니다. 이 저장소를 fork한 뒤 `data/`만 자신의 정보로 교체하면 GitHub Pages에서 별도 서버나 데이터베이스 없이 사용할 수 있습니다.

현재 들어 있는 데이터는 예시가 아니라 실제 개인 정보입니다. 공개하기 전에 `data/`의 프로필, 연락처, 논문, 프로젝트, 이미지 등을 모두 자신의 내용으로 확인하거나 교체하세요.

## 빠르게 시작하기

1. 이 저장소를 fork합니다.
2. 개인 홈페이지로 사용할 경우 저장소 이름을 `<GitHub 사용자명>.github.io`로 지정합니다. 일반 저장소 이름을 사용하면 프로젝트 사이트로도 배포할 수 있습니다.
3. `data/` 안의 파일과 `data/media/`의 미디어를 자신의 내용으로 교체합니다.
4. Windows에서 `app/tools/serve.bat`을 실행해 로컬 미리보기를 엽니다.
5. `app/tools/validate.bat`을 실행해 형식, ID 참조, 파일 경로를 검사합니다.
6. push 전에 `app/tools/build.bat`으로 내보내기 파일과 데이터 보고서를 갱신합니다.
7. 변경 사항을 push합니다.
8. GitHub 저장소의 **Settings → Pages**에서 **Deploy from a branch**, 배포 브랜치, `/(root)`를 선택합니다. 자세한 절차는 [GitHub Pages 배포 소스 안내](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)를 참고하세요.

배포된 화면은 브라우저가 `data/`를 직접 읽어 그립니다. 콘텐츠 변경을 화면에 반영하기 위한 별도의 빌드는 필요하지 않습니다.

## 지원 기능

- 영문·국문 전환과 언어별 fallback
- 프로필, 경력, 학력, 장학, 자격사항, 수상, 교육, 기술 역량
- 프로젝트와 소프트웨어 카드 및 이미지·동영상 갤러리
- 논문 검색, 유형·주제·공저자 필터와 최신순·유형별·주제별 보기
- 본인 저자 객체와 저자 순서를 이용한 주저자 자동 판별
- 저자별 소속 등의 마우스오버 정보
- under review, in press, 초록, 주제어, 비고 표시
- BibTeX 복사·내보내기와 전체 서지 내보내기 파일 생성
- 스크롤형 기록 페이지, 미디어 캐러셀, 확대 보기, 키보드·스와이프 조작
- 같은 데이터를 사용하는 영문·국문 CV와 브라우저 PDF 저장
- 모바일 탭 간 스와이프 이동
- 프레임워크와 외부 데이터베이스가 필요 없는 GitHub Pages 배포

## 저장소 구조와 편집 경계

| 위치 | 역할 | 일반 사용자의 편집 여부 |
|---|---|---|
| `data/` | 프로필과 모든 콘텐츠, 사용자 이미지·동영상 | **편집하는 영역** |
| `app/` | 화면 코드, 스타일, 아이콘, 검증 도구, 생성 파일 | 기능을 개발할 때만 편집 |
| `index.html`, `cv.html` | GitHub Pages 진입점 | 일반적으로 편집하지 않음 |
| `.github/` | push·PR 검증 자동화 | 일반적으로 편집하지 않음 |
| `.gitignore`, `.gitattributes`, `.nojekyll` | Git 및 GitHub Pages 필수 설정 | 루트에 유지 |

콘텐츠만 바꾸려는 사용자는 `data/` 이외의 구조를 알 필요가 없습니다. 디자인이나 동작을 수정하려는 개발자는 `app/assets/`, 검사·내보내기 기능을 수정하려는 개발자는 `app/tools/`를 사용합니다.

## 데이터 파일

| 파일 | 내용 |
|---|---|
| `data/settings.json` | 프로젝트 테마와 논문 주제의 ID, 영문·국문 명칭, 표시 순서와 기타 fallback |
| `data/profile.json` | 이름, 직책, 소속, 소개, 연락처, 경력, 학력, 장학, 자격, 수상, 교육, 기술 |
| `data/people.json` | 재사용되는 논문 저자 객체, 본인 표시, 저자별 보조 정보 |
| `data/publications.csv` | 논문·학술대회 발표와 초록, 주제어, 상태, 링크 |
| `data/awards.csv` | 수상명, 수상일, 수여기관으로 구성된 수상 기록 |
| `data/projects.json` | 프로젝트 설명과 미디어 갤러리 |
| `data/software.json` | 소프트웨어 설명, 기술 아이콘, 미디어 갤러리, 저장소·배포·웹 링크 |
| `data/notes.json` | 제목, 본문, 날짜, 여러 미디어와 캡션으로 구성된 기록 |
| `data/media/` | 사용자가 관리하는 프로필·프로젝트·소프트웨어·기록 이미지와 동영상 |

## 공통 데이터 규칙

- `id`를 사용하는 데이터는 파일 안에서 고유해야 하며 소문자와 URL에 안전한 문자를 권장합니다. 프로젝트와 논문은 `id`를 사용하지 않습니다.
- 다른 데이터가 참조하는 `id`는 변경하지 않습니다.
- `_en`, `_ko` 필드는 각 언어의 값입니다. 선택한 언어가 비어 있으면 가능한 공식 표기로 fallback합니다.
- 여러 ID나 키워드를 한 CSV 셀에 넣을 때는 세미콜론(`;`)으로 구분합니다.
- Boolean 값은 `true` 또는 `false`를 사용합니다.
- CSV는 **UTF-8 BOM** 형식입니다. Excel에서 직접 열어도 한글이 정상 표시됩니다.
- 쉼표가 포함된 CSV 셀은 Excel 또는 CSV 편집기가 큰따옴표로 처리하도록 둡니다.

현재 관계 필드는 다음과 같습니다.

- `publications.csv`의 `author_ids` → `people.json`
- `publications.csv`의 `award_id` → `awards.csv`

검증 도구는 중복 ID, 존재하지 않는 참조, 잘못된 날짜·상태·파일 경로를 거부합니다.

## 프로필 관리

`profile.json` 하나에서 메인 화면과 CV의 개인 정보를 함께 관리합니다. 프로필 카드의 대표 미디어는 `media` 객체로 입력합니다.

```json
"media": {
  "src": "profile.jpg",
  "type": "image"
}
```

동영상에는 선택적으로 포스터 이미지를 지정할 수 있습니다.

```json
"media": {
  "src": "profile.mp4",
  "type": "video",
  "poster": "profile.jpg"
}
```

경력, 학력, 장학, 자격사항처럼 반복되는 항목은 배열에 객체를 추가합니다. 장학의 `details`는 금액, 연구 주제, 선발 내용 등 항목마다 다른 정보를 `label`과 `value` 쌍으로 자유롭게 구성할 수 있습니다.

## 논문과 저자 관리

논문을 추가할 때는 다음 순서를 권장합니다.

1. 새 저자가 있으면 `people.json`에 고유 `id`와 이름을 추가합니다.
2. `publications.csv`에 한 행을 추가합니다.
3. `author_ids`에 논문상의 저자 순서대로 사람 ID를 입력합니다.
4. `app/tools/validate.bat`을 실행합니다.

중요한 논문 필드는 다음과 같습니다.

- `title_en`, `title_ko`: 공식 제목. 공식 번역이 없으면 빈칸으로 둡니다.
- `abstract_en`, `abstract_ko`: 공개된 초록. 없는 언어는 빈칸으로 둡니다.
- `keywords_en`, `keywords_ko`: 소문자로 작성하고 세미콜론으로 구분한 주제어.
- `author_ids`: `people.json`의 ID를 저자 순서대로 나열.
- `publication_type`: `international-journal`, `domestic-journal`, `international-conference`, `domestic-conference` 중 하나.
- `date`: 출판된 항목의 `YYYY`, `YYYY-MM`, `YYYY-MM-DD` 형식 날짜.
- `under_review`, `in_press`: 둘 중 하나만 `true`로 설정할 수 있으며 이때 `date`는 비워 둡니다.
- `topic`: `settings.json`에 등록된 주제 ID. 비어 있거나 정의되지 않은 값은 기타로 분류됩니다.
- `venue`: 학술지나 학술대회 정보.
- `note`: 값이 있으면 홈페이지에서 venue 바로 아래 같은 글꼴로 표시됩니다.
- `award_id`: 관련 수상이 있으면 `awards.csv`의 ID, 없으면 빈칸. 수상 화면과 CV의 논문 정보는 이 연결을 통해 논문 데이터에서 가져옵니다.
- `doi`, `url`: 원문 링크.

`people.json`에서는 정확히 한 사람만 `"is_self": true`여야 합니다. 그 사람이 `author_ids`의 첫 번째이면 사이트가 자동으로 주저자 논문으로 판단하므로 별도의 저자 역할 필드는 필요하지 않습니다.

사람 객체의 `notes_en`, `notes_ko`는 언어별 문자열 배열입니다. 소속이나 간단한 정보를 한 줄에 하나씩 입력하면 논문 저자와 공저자 필터에서 선택한 언어의 툴팁으로 표시됩니다. 선택 언어의 배열이 비어 있으면 다른 언어 배열로 fallback하며, 정보가 없으면 두 배열을 모두 `[]`로 둡니다.

논문 주제의 명칭과 순서는 `settings.json`의 `publication_topics`만 수정합니다. 기타는 별도 주제가 아니라 정의되지 않은 값을 받는 fallback이며 `publication_topic_fallback`에서 표시 명칭을 정합니다.

논문에는 별도 ID를 입력하지 않습니다. BibTeX·CSL 내보내기에 규격상 필요한 인용 키는 DOI, URL 또는 서지정보를 바탕으로 빌드할 때 자동 생성됩니다. `awards.csv`에는 논문 제목이나 저자 같은 서지정보를 중복 저장하지 않고 수상 자체 정보만 입력합니다.

## 프로젝트, 소프트웨어, 기록과 미디어

프로젝트, 소프트웨어, 기록은 이미지와 동영상을 함께 받을 수 있는 `media` 배열을 사용합니다.
프로젝트와 소프트웨어의 표시 순서는 각 JSON 배열에 적힌 순서이며 별도의 `order` 필드는 사용하지 않습니다. 프로젝트는 다른 데이터에서 참조되지 않으므로 `id`도 사용하지 않습니다.
프로젝트에는 `start_date`, `end_date`를 `YYYY-MM-DD` 형식으로 입력하고 `theme`에는 `settings.json`의 `project_themes`에 등록한 ID를 사용합니다. 날짜는 화면과 CV에서 `YYYY.MM.DD. – YYYY.MM.DD.` 형식으로 표시됩니다.

```json
{
  "start_date": "2026-07-27",
  "end_date": "2027-07-26",
  "theme": "retrofit"
}
```

프로젝트 테마를 추가하거나 명칭을 바꿀 때는 `settings.json`의 `project_themes`만 수정합니다. 정의되지 않은 값을 표시할 때 사용할 명칭은 `project_theme_fallback`에서 관리합니다.
프로젝트 탭의 상단 타임라인은 이 테마와 날짜를 이용해 자동 생성됩니다. 같은 테마에서 기간이 겹치는 과제는 여러 줄로 배치되며, 긴 전체 기간은 가로로 스크롤할 수 있습니다. 막대를 선택하면 해당 프로젝트 카드로 이동합니다.

```json
"media": [
  {
    "src": "projects/example.mp4",
    "poster": "projects/example-poster.jpg",
    "caption_en": "Simulation in progress",
    "caption_ko": "시뮬레이션 실행 화면"
  }
]
```

- 모든 `src`와 `poster`는 `data/media/` 기준 상대경로입니다.
- `.mp4`, `.webm`, `.ogv`, `.ogg`, `.mov`, `.m4v`는 동영상으로 자동 인식합니다.
- 확장자로 판단하기 어려우면 `"type": "video"` 또는 `"type": "image"`를 명시합니다.
- 프로젝트와 기록의 캡션은 선택 사항이며 소프트웨어 미디어는 영문·국문 캡션을 사용합니다.
- `notes.json`의 `content_en`, `content_ko`는 문단 문자열 배열입니다.
- 소프트웨어의 `technologies`에는 언어, 프레임워크, 핵심 플랫폼 이름을 입력합니다. 지원되는 항목은 실제 로고로, 나머지는 텍스트 fallback으로 표시됩니다.

소프트웨어의 저장소, 배포 페이지, 보존 기록, 홈페이지는 `links` 배열 하나로 관리합니다. URL만 입력하면 도메인에 따라 플랫폼 이름과 아이콘을 자동으로 선택합니다.

```json
"links": [
  "https://github.com/example/example",
  "https://pypi.org/project/example/",
  "https://zenodo.org/records/1234567",
  "https://example.org"
]
```

자동 판별 대상은 다음과 같습니다.

- 코드 저장소: GitHub, GitLab, Bitbucket, Codeberg, SourceForge
- 패키지·앱 배포: PyPI, npm, JSR, crates.io, NuGet, Maven Central, Anaconda, RubyGems, Packagist, pub.dev, Hex, CPAN, CRAN, Bioconductor, Go package, Flathub, Snap Store, Homebrew
- 컨테이너·모델 배포: Docker Hub, Quay, Hugging Face
- 연구 산출물·보존: Zenodo, Figshare, OSF, Software Heritage, DOI
- 위 목록에 없는 주소: 웹페이지

자동 이름 대신 별도 명칭이 필요한 일반 웹페이지는 객체로 적을 수 있습니다.

```json
"links": [
  {
    "url": "https://example.org/docs",
    "label_en": "Documentation",
    "label_ko": "문서"
  }
]
```

## 미리보기, 검증, 내보내기

Windows에서 다음 파일을 더블클릭할 수 있습니다.

| 도구 | 역할 |
|---|---|
| `app/tools/serve.bat` | 저장소 루트에서 로컬 서버를 열고 홈페이지 미리보기 실행 |
| `app/tools/validate.bat` | 데이터 구조, ID 참조, 미디어와 정적 파일 경로 검사 |
| `app/tools/build.bat` | 검증 후 서지 내보내기 파일과 보고서 재생성 |

Python 3만 필요하며 별도 패키지 설치는 없습니다. HTML 파일을 `file://`로 직접 열면 브라우저가 CSV·JSON 요청을 차단할 수 있으므로 `app/tools/serve.bat`을 사용하세요.

화면과 CV는 실행 시 `data/`를 직접 읽습니다. `app/tools/build.bat`이 생성하는 다음 파일은 화면 렌더링용 번들이 아니라 외부 활용을 위한 산출물입니다.

- `app/generated/publications.bib`
- `app/generated/publications.ris`
- `app/generated/publications.csl.json`
- `app/generated/build-report.json`

GitHub Actions는 push와 pull request마다 데이터 검증, 정적 경로 검사, JavaScript 문법 검사, 생성 파일의 최신 상태를 확인합니다.

## 권장 작업 흐름

```text
data 수정
→ app/tools/serve.bat으로 화면 확인
→ app/tools/validate.bat으로 검사
→ app/tools/build.bat으로 생성 파일 갱신
→ data/와 app/generated/ 변경 사항을 함께 commit·push
```

연락처와 경력뿐 아니라 이미지, 초록, 비공개 심사 상태 등 `data/`의 모든 내용은 배포 후 공개됩니다. push 전에 공개 가능한 정보인지 확인하세요.
