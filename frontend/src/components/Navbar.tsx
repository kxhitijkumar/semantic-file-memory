import { useState, useEffect } from "react";
import { Github } from "lucide-react";

const GITHUB_REPO_URL = "https://github.com/your-username/personal-knowledge-os";

const Navbar = () => {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 50);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled ? "glass border-b border-border/50" : "bg-transparent"
      }`}
    >
      <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
        <a href="#" className="font-bold text-foreground text-lg">
          <span className="gradient-text">Knowledge OS</span>
        </a>

        <div className="flex items-center gap-6">
          <a href="#architecture" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:block">
            Architecture
          </a>
          <a href="#problem" className="text-sm text-muted-foreground hover:text-foreground transition-colors hidden sm:block">
            Problem
          </a>
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg glass text-sm font-medium text-foreground hover:bg-secondary transition-all"
          >
            <Github className="w-4 h-4" />
            <span className="hidden sm:inline">GitHub</span>
          </a>
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
