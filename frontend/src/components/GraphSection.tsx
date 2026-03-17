import { motion } from "framer-motion";

const relationships = [
  { from: "Resume_Draft.docx", to: "Resume_Final.pdf", type: "VERSION_OF", desc: "Tracks document evolution" },
  { from: "Resume_Final.pdf", to: "Cover_Letter.docx", type: "RELATED_TO", desc: "Semantic similarity link" },
  { from: "Cover_Letter.docx", to: "Job_App_Form.pdf", type: "DERIVED_FROM", desc: "Content reuse detection" },
  { from: "Tax_2023.xlsx", to: "Trip_Receipts/", type: "CO_LOCATED", desc: "Folder/project context" },
  { from: "Report_v1.docx", to: "Report_v2.docx", type: "TEMPORAL_SEQUENCE", desc: "Chronological ordering" },
];

const GraphSection = () => {
  return (
    <section className="py-32 px-6 relative">
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_hsl(200_70%_55%_/_0.04)_0%,_transparent_60%)]" />
      <div className="max-w-5xl mx-auto relative z-10">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <h2 className="text-3xl md:text-5xl font-bold mb-4">
            Files Don't Live in <span className="gradient-text">Isolation</span>
          </h2>
          <p className="text-lg text-muted-foreground max-w-2xl mx-auto">
            The File Relationship Graph models document lineage, similarity, and context to enable contextual reasoning.
          </p>
        </motion.div>

        <div className="space-y-4">
          {relationships.map((rel, i) => (
            <motion.div
              key={i}
              className="glass gradient-border rounded-xl p-5 flex flex-col md:flex-row items-start md:items-center gap-4"
              initial={{ opacity: 0, y: 15 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.08 }}
            >
              <div className="flex items-center gap-3 flex-1 min-w-0">
                <span className="font-mono text-sm text-foreground truncate">{rel.from}</span>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <div className="h-px w-6 bg-primary/40" />
                  <span className="text-xs font-mono px-2 py-1 rounded bg-primary/10 text-primary border border-primary/20 whitespace-nowrap">
                    {rel.type}
                  </span>
                  <div className="h-px w-6 bg-primary/40" />
                </div>
                <span className="font-mono text-sm text-foreground truncate">{rel.to}</span>
              </div>
              <p className="text-sm text-muted-foreground flex-shrink-0">{rel.desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default GraphSection;
