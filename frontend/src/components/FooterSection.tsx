const FooterSection = () => {
  return (
    <footer className="py-16 px-6 border-t border-border">
      <div className="max-w-5xl mx-auto text-center">
        <h3 className="text-2xl md:text-3xl font-bold mb-3">
          <span className="gradient-text">The Personal Knowledge OS</span>
        </h3>
        <p className="text-sm text-muted-foreground mb-6 max-w-xl mx-auto">
          From Filesystem to Knowledge System — Semantic File Memory, File Relationship Graphs, and Hybrid Explainable Search.
        </p>
        <p className="text-xs text-muted-foreground/60 font-mono">
          Based on research by Kshitij Kumar
        </p>
      </div>
    </footer>
  );
};

export default FooterSection;
