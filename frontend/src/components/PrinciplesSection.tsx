import { motion } from "framer-motion";
import { Shield, Cpu, MonitorSmartphone, Layers, Eye, Puzzle } from "lucide-react";

const principles = [
  { icon: Shield, title: "Local-First & Privacy-Preserving", desc: "All processing remains on-device. No external dependencies." },
  { icon: Cpu, title: "Minimal LLM Usage", desc: "Language models restricted to intent parsing, not content analysis." },
  { icon: MonitorSmartphone, title: "Reuse of OS Indexing", desc: "Leverages Windows Search and IFilter for scalability." },
  { icon: Layers, title: "Hybrid Retrieval", desc: "Fuses symbolic, semantic, temporal and graph-based signals." },
  { icon: Eye, title: "Explainability by Design", desc: "All rankings and relationships are auditable and interpretable." },
  { icon: Puzzle, title: "Incremental & Non-Intrusive", desc: "The filesystem remains unchanged; intelligence is layered externally." },
];

const PrinciplesSection = () => {
  return (
    <section className="py-32 px-6 relative">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_bottom,_hsl(175_80%_50%_/_0.03)_0%,_transparent_60%)]" />
      <div className="max-w-5xl mx-auto relative z-10">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            Built for <span className="gradient-text">Privacy, Performance & Intelligence</span>
          </h2>
          <p className="text-lg text-muted-foreground">Six core design principles guide the system.</p>
        </motion.div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
          {principles.map((p, i) => (
            <motion.div
              key={i}
              className="rounded-xl glass gradient-border p-6 hover:border-glow transition-all duration-300"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.07 }}
            >
              <p.icon className="w-7 h-7 text-primary mb-3" />
              <h3 className="font-semibold text-foreground mb-2">{p.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{p.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default PrinciplesSection;
