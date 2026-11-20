import { Fragment } from "react";
import { hasBlanks, privacyPolicy, termsOfService } from "../legal";
import { Header } from "../ui";

// Renders "{{…}}" blanks as highlighted placeholders, so unfilled parts stand out.
function Text({ value }: { value: string }) {
  return <>{value.split(/(\{\{[^}]+\}\})/).map((part, index) => part.startsWith("{{")
    ? <mark className="legal-blank" key={index}>［{part.slice(2, -2)}］</mark>
    : <Fragment key={index}>{part}</Fragment>)}</>;
}

export default function LegalScreen({ doc, onBack }: { doc: "privacy" | "terms"; onBack: () => void }) {
  const content = doc === "privacy" ? privacyPolicy : termsOfService;
  return <>
    <Header back={onBack} title={content.title} />
    <article className="legal-doc">
      {hasBlanks(content) && <p className="legal-draft" role="note">초안입니다. 강조된 빈칸을 채우고 법률 검토를 받은 뒤 공개해 주세요.</p>}
      {content.sections.map(section => <section key={section.heading}>
        <h2>{section.heading}</h2>
        {section.body.map((block, index) => Array.isArray(block)
          ? <ul key={index}>{block.map(item => <li key={item}><Text value={item} /></li>)}</ul>
          : <p key={index}><Text value={block} /></p>)}
      </section>)}
    </article>
  </>;
}
