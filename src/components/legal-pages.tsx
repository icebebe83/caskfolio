"use client";

import { useLanguage } from "@/components/providers";

export function TermsOfServiceContent() {
  const { language } = useLanguage();

  const paragraphs =
    language === "kr"
      ? [
          "Caskfolio는 수집가가 세컨더리 시장 가격을 관찰하고 참고할 수 있도록 설계된 바틀 시장 아카이브이자 가격 인덱스입니다.",
          "이 플랫폼은 가격 발견, 과거 참고, 사용자 제출 등록의 가시성을 위한 용도로 운영됩니다.",
          "Caskfolio는 마켓플레이스가 아니며 결제, 에스크로, 중개, 바틀 검증을 제공하지 않습니다. 사용자 간 모든 상호작용은 플랫폼 외부에서 독립적으로 이루어집니다.",
          "등록은 개별 사용자가 제출합니다. Caskfolio는 어떤 등록의 정확성, 가용성, 진위 여부도 독립적으로 검증하지 않습니다. 사용자는 가격, 설명, 이미지, 연락처 정보를 포함해 자신이 게시한 정보에 대해 전적으로 책임을 집니다.",
          "Caskfolio에 표시되는 가격 및 시장 데이터는 참고용으로만 제공되며, 금융 또는 투자 조언으로 간주되어서는 안 됩니다.",
          "기준 가격 정보는 제3자 플랫폼에서 수집될 수 있으며, 항상 정확하거나 완전하거나 최신 상태라고 보장할 수 없습니다.",
          "이 플랫폼은 바틀 가격 스냅샷과 등록 참고 정보를 위한 공개 아카이브 역할만 합니다. 사용자는 어떤 정보를 평가할 때에도 스스로 판단해야 합니다.",
          "Caskfolio는 부정확하거나, 중복되거나, 오해의 소지가 있거나, 플랫폼 정책을 위반하는 것으로 보이는 등록을 수정, 병합, 보관 또는 제거할 권리를 가집니다.",
          "플랫폼을 남용하거나, 허위 정보를 게시하거나, 아카이브의 무결성을 해치는 계정은 제한되거나 정지될 수 있습니다.",
          "Caskfolio는 데이터 품질과 사용성을 유지하기 위해 언제든지 플랫폼, 구조, 정책을 업데이트하거나 변경할 수 있습니다.",
        ]
      : [
          "Caskfolio is a bottle market archive and price index designed to help collectors observe and reference secondary market pricing.",
          "The platform is intended for price discovery, historical reference, and visibility of user-submitted listings.",
          "Caskfolio is not a marketplace and does not facilitate payments, escrow, mediation, or bottle verification. All interactions between users occur independently outside the platform.",
          "Listings are submitted by individual users. Caskfolio does not independently verify the accuracy, availability, or authenticity of any listing. Users are solely responsible for the information they publish, including price, description, images, and contact details.",
          "Prices and market data displayed on Caskfolio are provided for reference purposes only and should not be considered financial or investment advice.",
          "Reference pricing may be sourced from third-party platforms and may not always be accurate, complete, or up to date.",
          "The platform serves solely as a public archive of bottle price snapshots and listing references. Users should exercise their own judgment when evaluating any information.",
          "Caskfolio reserves the right to edit, merge, archive, or remove listings that appear inaccurate, duplicated, misleading, or that violate platform policies.",
          "Accounts that abuse the platform, publish false information, or disrupt the integrity of the archive may be restricted or suspended.",
          "Caskfolio may update or modify the platform, its structure, and policies at any time to maintain data quality and usability.",
        ];

  return (
    <section className="panel p-6 sm:p-8">
      <p className="eyebrow">{language === "kr" ? "정책" : "Legal"}</p>
      <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-semibold text-ink">
        {language === "kr" ? "이용약관" : "Terms of Service"}
      </h1>
      <div className="mt-6 max-w-3xl space-y-5 text-sm leading-7 text-ink/70">
        {paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </section>
  );
}

export function PrivacyPolicyContent() {
  const { language } = useLanguage();

  const paragraphs =
    language === "kr"
      ? [
          "Caskfolio는 플랫폼을 바틀 가격 아카이브이자 인덱스로 운영하기 위해 필요한 데이터를 수집하고 저장합니다.",
          "여기에는 계정 식별자, 바틀 메타데이터, 등록 정보, 메신저 연락처 정보, 업로드된 이미지가 포함됩니다.",
          "메신저 연락처 정보는 사용자가 플랫폼 외부에서 소통할 수 있도록 활성 등록에 한해 표시됩니다. Caskfolio는 내부 메시징, 결제, 에스크로 서비스를 제공하지 않습니다.",
          "Caskfolio는 인증, 데이터베이스 저장, 미디어 처리를 위해 Supabase를 사용합니다. 데이터는 플랫폼 운영에 필요한 제3자 인프라를 통해 처리 및 저장될 수 있습니다.",
          "Caskfolio는 광고 목적으로 개인 데이터를 제3자에게 판매하거나 공유하지 않습니다.",
          "제출된 등록과 관련 데이터는 아카이브의 품질, 정확성, 무결성을 유지하기 위해 관리자가 검토할 수 있습니다.",
          "플랫폼을 사용하는 사용자는 자신이 제출한 데이터가 공개적으로 표시될 수 있으며 운영 정책에 따라 검토 및 조정될 수 있음을 인정합니다.",
        ]
      : [
          "Caskfolio collects and stores data necessary to operate the platform as a bottle price archive and index.",
          "This includes account identifiers, bottle metadata, listing information, messenger contact details, and uploaded images.",
          "Messenger contact details are displayed only on active listings to allow users to communicate outside the platform. Caskfolio does not provide internal messaging, payment, or escrow services.",
          "Caskfolio uses Supabase for authentication, database storage, and media handling. Data may be processed and stored using third-party infrastructure required for platform operation.",
          "Caskfolio does not sell or share personal data with third parties for advertising purposes.",
          "Submitted listings and associated data may be reviewed by administrators to maintain the quality, accuracy, and integrity of the archive.",
          "By using the platform, users acknowledge that their submitted data may be publicly visible and subject to moderation.",
        ];

  return (
    <section className="panel p-6 sm:p-8">
      <p className="eyebrow">{language === "kr" ? "정책" : "Legal"}</p>
      <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-semibold text-ink">
        {language === "kr" ? "개인정보처리방침" : "Privacy Policy"}
      </h1>
      <div className="mt-6 max-w-3xl space-y-5 text-sm leading-7 text-ink/70">
        {paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </section>
  );
}

export function ListingPolicyContent() {
  const { language } = useLanguage();

  const paragraphs =
    language === "kr"
      ? [
          "Caskfolio의 등록은 세컨더리 시장에서 실제로 존재하고 정당한 바틀 가용성을 반영해야 합니다.",
          "각 등록에는 정확한 바틀 식별 정보, 가격 정보, 그리고 유효한 메신저 연락 수단이 포함되어야 합니다.",
          "다음 항목은 등록할 수 없습니다: 가짜 또는 존재하지 않는 바틀, 오해를 주거나 의도적으로 잘못된 가격, 중복 스팸 등록, 유효하지 않거나 연락이 닿지 않는 연락처 정보.",
          "등록은 실제 소유 또는 바틀에 대한 정당한 접근 가능성을 반영해야 합니다. 추측성 또는 오해의 소지가 있는 등록은 제거될 수 있습니다.",
          "업로드된 이미지는 등록된 바틀을 정확히 보여줘야 합니다. 원본 이미지는 상세 보기에서 사용되고, 썸네일은 성능 최적화된 미리보기에 사용됩니다.",
          "Caskfolio는 품질 기준을 충족하지 않거나 유효한 사용자 신고를 받은 등록을 검토, 수정, 보관 또는 제거할 권리를 가집니다.",
        ]
      : [
          "Listings on Caskfolio must reflect real and legitimate bottle availability in the secondary market.",
          "Each listing must include accurate bottle identification, pricing information, and a valid messenger contact method.",
          "Listings must not contain: fake or non-existent bottles, misleading or intentionally incorrect pricing, duplicate spam listings, or invalid or unreachable contact details.",
          "Listings should represent actual ownership or legitimate access to the bottle. Speculative or misleading listings may be removed.",
          "Uploaded images must accurately represent the listed bottle. Original images are used for detail views, while thumbnails are used for performance-optimized previews.",
          "Caskfolio reserves the right to review, edit, archive, or remove listings that do not meet quality standards or that receive valid user reports.",
        ];

  return (
    <section className="panel p-6 sm:p-8">
      <p className="eyebrow">{language === "kr" ? "정책" : "Legal"}</p>
      <h1 className="mt-3 font-[family-name:var(--font-display)] text-4xl font-semibold text-ink">
        {language === "kr" ? "등록 정책" : "Listing Policy"}
      </h1>
      <div className="mt-6 max-w-3xl space-y-5 text-sm leading-7 text-ink/70">
        {paragraphs.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </div>
    </section>
  );
}
