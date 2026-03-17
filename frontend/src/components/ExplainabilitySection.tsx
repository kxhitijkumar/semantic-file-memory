import { motion } from "framer-motion";
import { FileText, Clock, Cpu, GitBranch } from "lucide-react";

const justifications = [
  { icon: FileText, label: "Matched Intent", detail: "Identified as 'resume' with 92% confidence", pct: 92 },
  { icon: Clock, label: "Temporal Relevance", detail: "Latest in its version chain (supersedes Draft)", pct: 88 },
  { icon: Cpu, label: "Semantic Similarity", detail: "High conceptual overlap with the query", pct: 85 },
  { icon: GitBranch, label: "Graph Justification", detail: "Central node in 'Job Application 2025' graph", pct: 78 },
];

const ExplainabilitySection = () => {
  return (
    <section className="py-32 px-6">
      <div className="max-w-4xl mx-auto">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            Not Just <span className="gradient-text">What</span>, But <span className="gradient-text">Why</span>
          </h2>
          <p className="text-lg text-muted-foreground">Every result comes with a transparent justification.</p>
        </motion.div>

        <motion.div
          className="glass gradient-border rounded-2xl p-8"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <div className="flex items-center gap-3 mb-6 pb-6 border-b border-border">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary" />
            </div>
            <div>
              <p className="font-mono text-sm text-primary">Resume_Final.pdf</p>
              <p className="text-xs text-muted-foreground">Result #1 · Composite Score: 0.94</p>
            </div>
          </div>

          <div className="space-y-5">
            {justifications.map((j, i) => (
              <motion.div
                key={i}
                className="flex items-start gap-4"
                initial={{ opacity: 0, x: -15 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <j.icon className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm font-medium text-foreground">{j.label}</span>
                    <span className="text-xs font-mono text-primary">{j.pct}%</span>
                  </div>
                  <p className="text-xs text-muted-foreground mb-2">{j.detail}</p>
                  <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                    <motion.div
                      className="h-full rounded-full"
                      style={{
                        background: "linear-gradient(90deg, hsl(175 80% 50%), hsl(200 70% 55%))",
                      }}
                      initial={{ width: 0 }}
                      whileInView={{ width: `${j.pct}%` }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.8, delay: i * 0.1 }}
                    />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default ExplainabilitySection;
