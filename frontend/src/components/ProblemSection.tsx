import { motion } from "framer-motion";
import { Search, FileText, Brain } from "lucide-react";

const queries = [
  { question: "Show me my latest resume.", standard: "Keywords: 'latest', 'resume'", icon: FileText },
  { question: "Find the final project report.", standard: "Keywords: 'final', 'project', 'report'", icon: Search },
  { question: "Pull up tax docs from my 2023 trip.", standard: "Keywords: 'tax', '2023', 'trip'", icon: Brain },
];

const ProblemSection = () => {
  return (
    <section id="problem" className="py-32 px-6">
      <div className="max-w-5xl mx-auto">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            Your Digital Life is Full of <span className="gradient-text">Connections</span>.
          </h2>
          <p className="text-xl text-muted-foreground">Your file search isn't.</p>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-6">
          {queries.map((q, i) => (
            <motion.div
              key={i}
              className="rounded-xl glass gradient-border p-6"
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
            >
              <q.icon className="w-8 h-8 text-primary mb-4" />
              <p className="font-semibold text-foreground mb-3">"{q.question}"</p>
              <div className="text-sm text-muted-foreground font-mono bg-muted/50 rounded-md px-3 py-2">
                {q.standard}
              </div>
            </motion.div>
          ))}
        </div>

        <motion.p
          className="text-center text-muted-foreground mt-10 text-lg"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          Standard search misses <span className="text-primary font-medium">temporal ordering</span>,{" "}
          <span className="text-primary font-medium">conceptual similarity</span>, and{" "}
          <span className="text-primary font-medium">document lineage</span>.
        </motion.p>
      </div>
    </section>
  );
};

export default ProblemSection;
