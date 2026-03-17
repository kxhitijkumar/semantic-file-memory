import Navbar from "@/components/Navbar";
import HeroSection from "@/components/HeroSection";
import ProblemSection from "@/components/ProblemSection";
import PrinciplesSection from "@/components/PrinciplesSection";
import ArchitectureSection from "@/components/ArchitectureSection";
import GraphSection from "@/components/GraphSection";
import ExplainabilitySection from "@/components/ExplainabilitySection";
import PerformanceSection from "@/components/PerformanceSection";
import ComparisonSection from "@/components/ComparisonSection";
import FooterSection from "@/components/FooterSection";

const Index = () => {
  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <HeroSection />
      <ProblemSection />
      <PrinciplesSection />
      <ArchitectureSection />
      <GraphSection />
      <ExplainabilitySection />
      <PerformanceSection />
      <ComparisonSection />
      <FooterSection />
    </div>
  );
};

export default Index;
