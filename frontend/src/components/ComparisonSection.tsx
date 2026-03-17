import { motion } from "framer-motion";
import { X, Check } from "lucide-react";

const features = [
  { name: "Intent Awareness", standard: false, proposed: true },
  { name: "Semantic Memory", standard: false, proposed: true },
  { name: "Relationship Modeling", standard: false, proposed: "Graph-based" },
  { name: "Explainability", standard: false, proposed: true },
  { name: "Privacy-Preserving", standard: true, proposed: true },
  { name: "Sub-second Latency", standard: true, proposed: true },
];

const ComparisonSection = () => {
  return (
    <section className="py-32 px-6 relative">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_hsl(175_80%_50%_/_0.03)_0%,_transparent_50%)]" />
      <div className="max-w-3xl mx-auto relative z-10">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            A <span className="gradient-text">Paradigm Shift</span> for Personal Search
          </h2>
        </motion.div>

        <motion.div
          className="glass gradient-border rounded-2xl overflow-hidden"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <div className="grid grid-cols-3 text-sm font-semibold border-b border-border">
            <div className="p-4 text-muted-foreground">Feature</div>
            <div className="p-4 text-center text-muted-foreground">Windows Search</div>
            <div className="p-4 text-center text-primary">Knowledge OS</div>
          </div>
          {features.map((f, i) => (
            <div
              key={i}
              className="grid grid-cols-3 text-sm border-b border-border/50 last:border-0 hover:bg-muted/30 transition-colors"
            >
              <div className="p-4 font-medium text-foreground">{f.name}</div>
              <div className="p-4 flex justify-center">
                {f.standard ? (
                  <Check className="w-5 h-5 text-primary" />
                ) : (
                  <X className="w-5 h-5 text-muted-foreground/40" />
                )}
              </div>
              <div className="p-4 flex justify-center">
                {typeof f.proposed === "string" ? (
                  <span className="text-primary font-mono text-xs bg-primary/10 px-2 py-1 rounded">{f.proposed}</span>
                ) : (
                  <Check className="w-5 h-5 text-primary" />
                )}
              </div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default ComparisonSection;
