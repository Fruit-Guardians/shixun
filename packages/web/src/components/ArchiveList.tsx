import { ArrowRight } from 'lucide-react';
import type { ReportSummary } from '#shared';
import { topicEyebrow } from '../lib/labels.ts';
import { formatCount } from '../lib/format.ts';

interface ArchiveListProps {
  reports: ReportSummary[];
  storyCounts: ReadonlyMap<string, number>;
  onOpen: (id: string) => void;
}

/** 归档以 git log 的样式排成时间线。 */
export default function ArchiveList({ reports, storyCounts, onOpen }: ArchiveListProps) {
  return (
    <div className="archive-list">
      {reports.map((report) => (
        <button key={report.id} className="archive-card" onClick={() => onOpen(report.id)}>
          <div className="archive-date">
            {report.date.slice(5).replace('-', '.')}
            <small>{report.date.slice(0, 4)}</small>
          </div>
          <div>
            <span className="archive-meta">
              <span className="hash">commit {report.id.slice(0, 7)}</span> · {topicEyebrow(report.topic)}
            </span>
            <h2>{report.title}</h2>
            <span className="archive-meta">
              {storyCounts.get(report.id) ?? 0} stories · {formatCount(report.chars)} chars · {report.source}
            </span>
          </div>
          <ArrowRight size={20} />
        </button>
      ))}
    </div>
  );
}
