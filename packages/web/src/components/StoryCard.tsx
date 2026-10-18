import { ArrowRight, Bookmark } from 'lucide-react';
import type { CSSProperties } from 'react';
import { CATEGORIES } from '#shared';
import type { Category, Story } from '#shared';
import { tagCode, topicLabel } from '../lib/labels.ts';
import Highlight from './Highlight.tsx';

interface StoryCardProps {
  story: Story;
  position: number;
  lead: boolean;
  query: string;
  saved: boolean;
  onToggleSave: (id: string) => void;
  onOpen: (reportId: string, storyIndex: number) => void;
}

/** 与侧栏领域方块同色：按 CATEGORIES 顺序取 --c0…--c6。 */
function tagColor(tag: string): string {
  const i = CATEGORIES.indexOf(tag as Category) - 1;
  return i >= 0 ? `var(--c${i})` : 'var(--accent)';
}

export default function StoryCard({ story, position, lead, query, saved, onToggleSave, onOpen }: StoryCardProps) {
  const open = () => onOpen(story.reportId, story.index);
  return (
    <article className={`story-card ${lead ? 'lead-story' : ''}`} style={{ '--i': Math.min(position, 12) } as CSSProperties}>
      <div className="story-top">
        <span className="story-index">#{String(position + 1).padStart(2, '0')}</span>
        {lead && <span className="lead-badge">HEADLINE</span>}
        <div className="story-tags">
          {story.tags.slice(0, 2).map((tag) => (
            <span className="tag" style={{ '--tc': tagColor(tag) } as CSSProperties} key={tag} title={tag}>
              {tagCode(tag)}
            </span>
          ))}
        </div>
        <button
          className={`bookmark-button ${saved ? 'is-saved' : ''}`}
          onClick={() => onToggleSave(story.id)}
          aria-label={saved ? `取消收藏：${story.title}` : `收藏：${story.title}`}
          aria-pressed={saved}
        >
          <Bookmark size={14} fill={saved ? 'currentColor' : 'none'} />
          {saved ? 'saved' : 'save'}
        </button>
      </div>
      <button className="story-content" onClick={open}>
        <h2>
          <Highlight text={story.title} query={query} />
        </h2>
        <p>
          <Highlight text={story.summary} query={query} />
        </p>
      </button>
      <div className="story-bottom">
        <span>
          {story.date} · {topicLabel(story.topic)}
        </span>
        <button onClick={open} aria-label={`阅读：${story.title}`}>
          open
          <ArrowRight size={14} />
        </button>
      </div>
    </article>
  );
}
