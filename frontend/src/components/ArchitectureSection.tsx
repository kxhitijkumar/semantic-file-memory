import { motion } from "framer-motion";

const stages = [
  { label: "Query Intelligence", detail: "Local LLM parses user intent into concepts, constraints & biases", color: "hsl(175, 80%, 50%)" },
  { label: "Windows Search", detail: "OS-native candidate retrieval (1–10ms)", color: "hsl(200, 70%, 55%)" },
  { label: "BM25 Scoring", detail: "Standard keyword relevance scoring", color: "hsl(175, 60%, 45%)" },
  { label: "Semantic Re-ranking", detail: "Vector-based conceptual similarity scoring", color: "hsl(200, 80%, 50%)" },
  { label: "Graph Expansion", detail: "Relationship graph boosts connected files", color: "hsl(175, 80%, 50%)" },
  { label: "Temporal Reasoning", detail: "Applies constraints like 'latest' & access frequency", color: "hsl(190, 70%, 50%)" },
  { label: "Explainable Ranking", detail: "Generates justifications for each result", color: "hsl(200, 75%, 55%)" },
];

const ArchitectureSection = () => {
  return (
    <section id="architecture" className="py-32 px-6">
      <div className="max-w-5xl mx-auto">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            The <span className="gradient-text">Hybrid Intelligence</span> Pipeline
          </h2>
          <p className="text-lg text-muted-foreground">From natural language query to explainable, ranked results.</p>
        </motion.div>

        <div className="relative">
          {/* Vertical line */}
          <div className="absolute left-6 md:left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-transparent via-primary/30 to-transparent" />

          <div className="space-y-8">
            {stages.map((stage, i) => {
              const isLeft = i % 2 === 0;
              return (
                <motion.div
                  key={i}
                  className={`relative flex items-center gap-6 ${isLeft ? "md:flex-row" : "md:flex-row-reverse"}`}
                  initial={{ opacity: 0, x: isLeft ? -30 : 30 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                >
                  <div className={`flex-1 ${isLeft ? "md:text-right" : "md:text-left"} hidden md:block`} />
                  
                  {/* Node */}
                  <div className="relative z-10 flex-shrink-0">
                    <div
                      className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold font-mono"
                      style={{
                        background: `${stage.color}20`,
                        border: `2px solid ${stage.color}`,
                        color: stage.color,
                        boxShadow: `0 0 20px ${stage.color}30`,
                      }}
                    >
                      {i + 1}
                    </div>
                  </div>

                  <div className="flex-1 glass gradient-border rounded-xl p-5">
                    <h3 className="font-semibold text-foreground mb-1">{stage.label}</h3>
                    <p className="text-sm text-muted-foreground">{stage.detail}</p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};

export default ArchitectureSection;
