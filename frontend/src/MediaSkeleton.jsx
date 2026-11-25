import "./media-skeleton.css";

export default function MediaSkeleton({ kind = "keywords" }) {
  if (kind === "count") return <span className="media-skeleton-count media-skeleton-fill" aria-hidden="true" />;
  if (kind === "trend") return <div className="media-skeleton media-skeleton-trend" aria-hidden="true">
    {[0, 1, 2, 3].map(index => <div className="media-skeleton-plot" key={index}><div className="media-skeleton-plot-heading"><i className="media-skeleton-fill" /><i className="media-skeleton-fill" /></div><div className="media-skeleton-canvas media-skeleton-fill" /></div>)}
  </div>;
  if (kind === "issues") return <div className="media-skeleton media-skeleton-issues" aria-hidden="true">
    {[0, 1, 2, 3, 4, 5].map(index => <div className="media-skeleton-story" key={index}><i className="media-skeleton-fill" /><b className="media-skeleton-fill" /><b className="media-skeleton-fill" /></div>)}
  </div>;
  return <div className="media-skeleton media-skeleton-keywords" aria-hidden="true">
    {[0, 1, 2, 3, 4, 5, 6, 7].map(index => <div key={index}><i className="media-skeleton-fill" /><b className="media-skeleton-fill" /><span className="media-skeleton-fill" /></div>)}
  </div>;
}
