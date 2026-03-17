import { motion } from "framer-motion";
import { Github } from "lucide-react";
import GraphBackground from "./GraphBackground";

const GITHUB_REPO_URL = "https://github.com/your-username/personal-knowledge-os";

const HeroSection = () => {
  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      <GraphBackground />
      
      {/* Radial gradient overlay */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_hsl(175_80%_50%_/_0.06)_0%,_transparent_70%)]" />
      
      <div className="relative z-10 max-w-5xl mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border-glow mb-8">
            <span className="node-dot" />
            <span className="text-sm font-mono text-primary">Local-First · Privacy-Preserving · Graph-Aware</span>
          </div>
        </motion.div>

        <motion.h1
          className="text-5xl md:text-7xl lg:text-8xl font-bold tracking-tight mb-6 leading-[1.05]"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.15 }}
        >
          <span className="text-foreground">The Personal</span>
          <br />
          <span className="gradient-text">Knowledge OS</span>
        </motion.h1>

        <motion.p
          className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10 leading-relaxed"
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.3 }}
        >
          A semantic search layer that augments the Windows filesystem with intent understanding,
          hybrid retrieval, and explainable personal knowledge memory.
        </motion.p>

        <motion.div
          className="flex flex-col sm:flex-row gap-4 justify-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.45 }}
        >
          <a
            href="#architecture"
            className="inline-flex items-center justify-center px-8 py-3.5 rounded-lg bg-primary text-primary-foreground font-semibold hover:brightness-110 transition-all border-glow"
          >
            Explore the Architecture
          </a>
          <a
            href="#problem"
            className="inline-flex items-center justify-center px-8 py-3.5 rounded-lg glass font-semibold text-foreground hover:bg-secondary transition-all"
          >
            See the Problem
          </a>
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-2 px-8 py-3.5 rounded-lg glass font-semibold text-foreground hover:bg-secondary transition-all"
          >
            <Github className="w-5 h-5" />
            View on GitHub
          </a>
        </motion.div>
      </div>

      {/* Bottom fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent" />
    </section>
  );
};

export default HeroSection;
