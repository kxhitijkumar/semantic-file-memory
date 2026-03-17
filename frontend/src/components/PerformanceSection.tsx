import { motion } from "framer-motion";

const metrics = [
  { component: "Phi-3 Mini (Intent Parsing)", latency: "~520ms", width: "52%" },
  { component: "Windows Search (Candidates)", latency: "1–10ms", width: "5%" },
  { component: "BM25 (Keyword Score)", latency: "5–30ms", width: "8%" },
  { component: "Vector Search (Semantic)", latency: "~50ms", width: "12%" },
  { component: "Graph Traversal (Context)", latency: "5–15ms", width: "6%" },
];

const PerformanceSection = () => {
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
            Fast, Private, and <span className="gradient-text">Entirely Local</span>
          </h2>
          <p className="text-lg text-muted-foreground">Sub-second performance. Zero cloud dependency.</p>
        </motion.div>

        <div className="glass gradient-border rounded-2xl p-8 space-y-6">
          {metrics.map((m, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
            >
              <div className="flex justify-between mb-2">
                <span className="text-sm font-medium text-foreground">{m.component}</span>
                <span className="text-sm font-mono text-primary">{m.latency}</span>
              </div>
              <div className="h-2 rounded-full bg-muted overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{
                    background: "linear-gradient(90deg, hsl(175 80% 50%), hsl(200 70% 55%))",
                  }}
                  initial={{ width: 0 }}
                  whileInView={{ width: m.width }}
                  viewport={{ once: true }}
                  transition={{ duration: 1, delay: i * 0.1 }}
                />
              </div>
            </motion.div>
          ))}

          <motion.div
            className="pt-6 border-t border-border flex items-center justify-between"
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 }}
          >
            <span className="text-lg font-semibold text-foreground">Total Query Time</span>
            <span className="text-2xl font-bold font-mono text-glow text-primary">&lt; 220ms</span>
          </motion.div>
        </div>
      </div>
    </section>
  );
};

export default PerformanceSection;
