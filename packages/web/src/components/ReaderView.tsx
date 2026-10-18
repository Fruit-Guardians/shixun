import { ArrowLeft, FileText, History, Info, Link2 } from "lucide-react";
import { useMemo, useRef } from "react";
import { sectionsFor } from "#shared";
import type { ReportSummary } from "#shared";
import type { ReportText } from "../hooks/useReportText.ts";
import { useReadingProgress } from "../hooks/useScroll.ts";
import { formatCount, readMinutes, tocLabel } from "../lib/format.ts";
import { reportHash } from "../lib/route.ts";
import Markdown from "./Markdown.tsx";

interface ReaderViewProps {
  report: ReportSummary;
  text: ReportText;
  downloadUrl: string;
  onBack: () => void;
  onCopyLink: (id: string) => void;
  onOpenVersions: () => void;
}

export default function ReaderView({
  report,
  text,
  downloadUrl,
  onBack,
  onCopyLink,
  onOpenVersions,
}: ReaderViewProps) {
  const content = useRef<HTMLElement>(null);
  const { bar, activeSection } = useReadingProgress(content);
  const raw = text.status === "ready" ? text.raw : "";
  const sections = useMemo(() => sectionsFor(raw), [raw]);

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
          <button className="outline-button" onClick={onOpenVersions}>
            <History size={14} />
            <span>版本</span>
          </button>
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
            {text.status === "ready" ? (
              <>
                <Markdown raw={text.raw} />
                <div className="article-end">-- (END) 全文完 --</div>
              </>
            ) : text.status === "error" ? (
              <div className="error-banner" role="alert">
                <span>{text.message}</span>
                <button onClick={text.retry}>重试</button>
              </div>
            ) : (
              <div className="loading-state" role="status" aria-label="正在载入原文…">
                <p>
                  <span className="prompt">$</span> cat {report.date}.md
                </p>
                <p className="dim">
                  loading<span className="cursor" aria-hidden="true" />
                </p>
              </div>
            )}
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
                {formatCount(report.chars)} chars · ~
                {readMinutes(report.chars)} min
              </span>
            </div>
          </div>
        </aside>
      </div>
    </>
  );
}
