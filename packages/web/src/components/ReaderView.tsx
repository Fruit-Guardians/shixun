import { ArrowLeft, FileText, Info, Link2 } from "lucide-react";
import { useMemo, useRef } from "react";
import { sectionsFor } from "#shared";
import type { Report } from "#shared";
import { useReadingProgress } from "../hooks/useScroll.ts";
import { formatCount, readMinutes, tocLabel } from "../lib/format.ts";
import { reportHash } from "../lib/route.ts";
import Markdown from "./Markdown.tsx";

interface ReaderViewProps {
  report: Report;
  downloadUrl: string;
  onBack: () => void;
  onCopyLink: (id: string) => void;
}

export default function ReaderView({
  report,
  downloadUrl,
  onBack,
  onCopyLink,
}: ReaderViewProps) {
  const content = useRef<HTMLElement>(null);
  const { bar, activeSection } = useReadingProgress(content);
  const sections = useMemo(() => sectionsFor(report.raw), [report.raw]);

  return (
    <>
      <div className="reading-progress" ref={bar} aria-hidden="true" />
      <div className="reader-toolbar">
        <button className="btn btn-ghost" onClick={onBack}>
          <ArrowLeft size={15} />
          cd ..
        </button>
        <div className="reader-actions">
          <button
            className="outline-button"
            onClick={() => onCopyLink(report.id)}
          >
            <Link2 size={14} />
            <span>复制链接</span>
          </button>
          <a href={downloadUrl} className="outline-button">
            <FileText size={14} />
            <span>下载原文 .md</span>
          </a>
        </div>
      </div>
      <div className="reading-layout">
        <article className="reader-paper window" ref={content}>
          <div className="window-bar">
            <span className="window-dots" aria-hidden="true">
              <i />
              <i />
              <i />
            </span>
            <span className="window-title">
              less {report.date}.md — {report.source}
            </span>
          </div>
          <div className="window-body">
            <div className="source-notice">
              <Info size={14} />
              正文按原文呈现；链接和技术结论尚未由本站独立核验。
            </div>
            <Markdown raw={report.raw} />
            <div className="article-end">-- (END) 全文完 --</div>
          </div>
        </article>
        <aside className="toc window">
          <div className="window-bar">
            <span className="window-title">ls sections/</span>
          </div>
          <div className="window-body">
            {sections.map((section) => (
              <a
                key={section.id}
                className={activeSection === section.id ? "on" : ""}
                href={`#${reportHash(report.id)}`}
                onClick={(e) => {
                  e.preventDefault();
                  document
                    .getElementById(section.id)
                    ?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                {tocLabel(section.label)}
              </a>
            ))}
            <div className="toc-info">
              <FileText size={14} />
              <span>
                {formatCount(report.raw.length)} chars · ~
                {readMinutes(report.raw)} min
              </span>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
