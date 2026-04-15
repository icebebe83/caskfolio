export type Language = "en" | "kr";

export const LANGUAGE_STORAGE_KEY = "caskfolio-language";

export function tCategory(language: Language, value: string): string {
  if (language === "en") return value;
  switch (value) {
    case "All":
      return "전체";
    case "Whisky":
      return "위스키";
    case "Bourbon":
      return "버번";
    case "Tequila":
      return "테킬라";
    case "Rum":
      return "럼";
    case "Etc":
      return "기타";
    case "Sake":
      return "사케";
    case "Other spirits":
      return "기타 증류주";
    default:
      return value;
  }
}

export function tCondition(language: Language, value: string): string {
  if (language === "en") return value;
  switch (value) {
    case "New":
      return "새 상품";
    case "Sealed":
      return "밀봉";
    case "No Box":
      return "박스 없음";
    case "Label Wear":
      return "라벨 손상";
    case "Damaged Box":
      return "박스 손상";
    default:
      return value;
  }
}

export function tMessenger(language: Language, value: string): string {
  if (language === "en") return value;
  switch (value) {
    case "Telegram":
      return "텔레그램";
    case "Signal":
      return "시그널";
    case "WhatsApp":
      return "왓츠앱";
    case "Line":
      return "라인";
    default:
      return value;
  }
}

export function tLabelVersion(language: Language, value: string): string {
  if (language === "en") return value;
  switch (value) {
    case "New Label":
      return "신형 라벨";
    case "Old Label":
      return "구형 라벨";
    default:
      return value;
  }
}

export function tStatus(language: Language, value: string): string {
  if (language === "en") return value;
  switch (value.toLowerCase()) {
    case "active":
      return "활성";
    case "inactive":
      return "비활성";
    default:
      return value;
  }
}

export function tListingAction(language: Language, value: string): string {
  if (language === "en") return value;
  switch (value) {
    case "Activate":
      return "활성화";
    case "Mark inactive":
      return "비활성화";
    case "Edit listing":
      return "등록 수정";
    case "Close edit":
      return "수정 닫기";
    case "Delete listing":
      return "등록 삭제";
    case "Deleting...":
      return "삭제 중...";
    case "Report listing":
      return "신고하기";
    case "Report submitted.":
      return "신고가 접수되었습니다.";
    case "Listing updated.":
      return "등록이 수정되었습니다.";
    case "Save changes":
      return "변경사항 저장";
    case "Saving...":
      return "저장 중...";
    case "Cancel":
      return "취소";
    default:
      return value;
  }
}

export function tListingUi(language: Language, value: string): string {
  if (language === "en") return value;
  switch (value) {
    case "Details not set":
      return "정보 미입력";
    case "Lowest comparable price":
      return "최저 비교 가격";
    case "Input":
      return "입력값";
    case "Listed":
      return "등록일";
    case "Contact":
      return "연락하기";
    case "Contact unavailable.":
      return "연락할 수 없습니다.";
    case "Sign in to contact.":
      return "연락하려면 로그인하세요.";
    case "Messenger details not provided.":
      return "메신저 정보가 없습니다.";
    case "Messenger enabled":
      return "메신저 사용 가능";
    case "No messenger":
      return "메신저 없음";
    case "KakaoTalk ID copied. Add the user in KakaoTalk.":
      return "카카오톡 ID가 복사되었습니다. 카카오톡에서 추가해 주세요.";
    case "Copy failed. Use the saved KakaoTalk ID manually.":
      return "복사에 실패했습니다. 저장된 카카오톡 ID를 직접 사용해 주세요.";
    case "Edit listing":
      return "등록 수정";
    case "Update":
      return "수정";
    case "Close":
      return "닫기";
    case "Listing settings":
      return "등록 설정";
    case "Availability":
      return "노출 상태";
    case "Condition":
      return "컨디션";
    case "Price details":
      return "가격 정보";
    case "Currency":
      return "통화";
    case "Price":
      return "가격";
    case "Inventory details":
      return "재고 정보";
    case "Quantity":
      return "수량";
    case "Region":
      return "지역";
    case "Contact details":
      return "연락 정보";
    case "Messenger":
      return "메신저";
    case "Messenger ID":
      return "메신저 ID";
    case "Enter your messenger handle":
      return "메신저 아이디를 입력하세요";
    case "Replace image":
      return "이미지 교체";
    case "Upload a new image only if you want to replace the current listing photo.":
      return "현재 등록 이미지를 바꿀 때만 새 이미지를 업로드하세요.";
    case "Note":
      return "메모";
    case "Updated price preview":
      return "수정 후 가격 미리보기";
    case "Delete this listing?":
      return "이 등록을 삭제할까요?";
    case "Listing deleted.":
      return "등록이 삭제되었습니다.";
    case "Unable to delete listing.":
      return "등록을 삭제할 수 없습니다.";
    case "Optional context for the admin queue":
      return "관리자 검토용 설명을 입력하세요 (선택)";
    case "Submit report":
      return "신고 제출";
    case "Sending...":
      return "전송 중...";
    case "Unable to submit report.":
      return "신고를 제출할 수 없습니다.";
    default:
      return value;
  }
}

export function formatUiDate(
  value: string | Date | { toDate(): Date } | null | undefined,
  language: Language,
): string {
  const date = value
    ? value instanceof Date
      ? value
      : typeof value === "object" && "toDate" in value
        ? value.toDate()
        : new Date(value)
    : null;
  if (!date || Number.isNaN(date.getTime())) {
    return language === "kr" ? "날짜 없음" : "Unknown date";
  }

  return new Intl.DateTimeFormat(language === "kr" ? "ko-KR" : "en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}
