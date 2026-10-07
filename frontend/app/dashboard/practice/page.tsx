"use client";
import { useState, useEffect, use } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { api } from "@/lib/api";
import {
  Sparkles, Target, Zap, Brain, CheckCircle2, XCircle, AlertCircle,
  HelpCircle, RefreshCw, ChevronRight, Award, BookOpen, Layers,
  MessageSquare, Play, BarChart2, ArrowRight
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface QuizQuestion {
  id: number;
  question: string;
  options: string[];
  correct_index?: number;
  explanation?: string;
  hint?: string;
  concept?: string;
}

interface PracticeQuizData {
  id: number;
  title: string;
  quiz_type: string;
  target_concepts: string[];
  difficulty: string;
  quiz_mode: string;
  questions: QuizQuestion[];
  status?: string;
  score?: number;
  latest_attempt?: any;
}

export default function PracticeHub() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loadingRecs, setLoadingRecs] = useState(true);
  const [recommendations, setRecommendations] = useState<any>({
    weak_concepts: [],
    mastered_concepts: [],
    courses: [],
    available_topics: []
  });

  const [pastQuizzes, setPastQuizzes] = useState<any[]>([]);

  // Generation state
  const [selectedCourse, setSelectedCourse] = useState<number | "">("");
  const [quizType, setQuizType] = useState<"weak_concepts" | "topic_mastery">("weak_concepts");
  const [selectedConcept, setSelectedConcept] = useState<string>("");
  const [customConcept, setCustomConcept] = useState<string>("");
  const [difficulty, setDifficulty] = useState<string>("adaptive");
  const [questionCount, setQuestionCount] = useState<number>(5);
  const [quizMode, setQuizMode] = useState<"standard_quiz" | "interactive_socratic">("standard_quiz");

  const [isGenerating, setIsGenerating] = useState(false);
  const [activeQuiz, setActiveQuiz] = useState<PracticeQuizData | null>(null);

  // Active quiz attempting state
  const [userAnswers, setUserAnswers] = useState<Record<number, number>>({});
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const [shownHints, setShownHints] = useState<Record<number, boolean>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState<any | null>(null);

  useEffect(() => {
    fetchRecommendations();
    fetchPastQuizzes();

    if (searchParams?.get("mode") === "weak_concepts") {
      setQuizType("weak_concepts");
    }
  }, [searchParams]);

  const fetchRecommendations = async () => {
    try {
      setLoadingRecs(true);
      const data = await api.get("/practice-quiz/recommendations");
      setRecommendations(data);
      if (data.courses?.length > 0) {
        setSelectedCourse(data.courses[0].id);
      }
    } catch (err) {
      console.error("Failed to load practice recommendations:", err);
    } finally {
      setLoadingRecs(false);
    }
  };

  const fetchPastQuizzes = async () => {
    try {
      const list = await api.get("/practice-quiz/");
      setPastQuizzes(list || []);
    } catch (err) {
      console.error("Failed to fetch past quizzes:", err);
    }
  };

  const handleGenerateQuiz = async () => {
    try {
      setIsGenerating(true);
      setEvaluationResult(null);
      setUserAnswers({});
      setCurrentQIndex(0);
      setShownHints({});

      const conceptToUse = customConcept.trim() || selectedConcept || "";

      const res = await api.post("/practice-quiz/generate", {
        course_id: selectedCourse || undefined,
        quiz_type: quizType,
        custom_concept: conceptToUse,
        difficulty: difficulty,
        question_count: questionCount,
        quiz_mode: quizMode
      });

      if (quizMode === "interactive_socratic") {
        // Start socratic viva thread directly
        const vivaRes = await api.post(`/practice-quiz/${res.id}/start-socratic`);
        router.push(`/chat/${vivaRes.thread_id}`);
        return;
      }

      setActiveQuiz(res);
      fetchPastQuizzes();
    } catch (err) {
      console.error("Failed to generate quiz:", err);
      alert("Could not generate practice quiz. Please check backend status.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSelectOption = (questionId: number, optionIdx: number) => {
    if (evaluationResult) return; // Prevent changing after submit
    setUserAnswers((prev) => ({
      ...prev,
      [questionId]: optionIdx
    }));
  };

  const handleSubmitQuiz = async () => {
    if (!activeQuiz) return;
    try {
      setIsSubmitting(true);
      const res = await api.post(`/practice-quiz/${activeQuiz.id}/submit`, {
        answers: userAnswers
      });
      setEvaluationResult(res);
      fetchPastQuizzes();
      fetchRecommendations(); // Refresh concept scores
    } catch (err) {
      console.error("Failed to submit quiz:", err);
      alert("Submission failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const loadPastQuiz = async (quizId: number) => {
    try {
      setIsGenerating(true);
      const data = await api.get(`/practice-quiz/${quizId}`);
      setActiveQuiz(data);
      if (data.latest_attempt) {
        setUserAnswers(data.latest_attempt.answers || {});
        setEvaluationResult({
          score: data.latest_attempt.score,
          evaluation: data.latest_attempt.feedback?.evaluation || [],
          concept_updates: data.latest_attempt.feedback?.concept_updates || {}
        });
      } else {
        setUserAnswers({});
        setEvaluationResult(null);
      }
      setCurrentQIndex(0);
    } catch (err) {
      console.error("Failed to load quiz details:", err);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", paddingBottom: 60 }} className="fade-in">
      {/* Header Banner */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
            <span className="tag tag-purple" style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <Sparkles size={13} /> Adaptive Learning Engine
            </span>
            <span style={{ fontSize: 13, color: "var(--text-muted)" }}>Student Self-Mastery Studio</span>
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 900, letterSpacing: "-0.02em" }}>
            Adaptive Practice & Concept Mastery
          </h1>
          <p style={{ color: "var(--text-secondary)", fontSize: 15 }}>
            Generate evolving practice quizzes targeted specifically to your weak areas or master any topic on demand.
          </p>
        </div>

        {activeQuiz && (
          <button
            onClick={() => { setActiveQuiz(null); setEvaluationResult(null); }}
            className="btn-ghost"
            style={{ padding: "10px 18px", fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}
          >
            ← Back to Generator Hub
          </button>
        )}
      </div>

      {/* Main Container */}
      {!activeQuiz ? (
        <div style={{ display: "grid", gridTemplateColumns: "1.8fr 1fr", gap: 32 }}>
          {/* Left Column: Generator Studio */}
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Quick Mode Cards */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
              <div
                onClick={() => { setQuizType("weak_concepts"); setSelectedConcept(""); setCustomConcept(""); }}
                className="glass"
                style={{
                  padding: 20,
                  borderRadius: 16,
                  cursor: "pointer",
                  border: quizType === "weak_concepts" ? "2px solid var(--accent)" : "1px solid var(--border)",
                  background: quizType === "weak_concepts" ? "rgba(139, 92, 246, 0.08)" : "var(--bg-card)",
                  transition: "all 0.2s ease"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(239, 68, 68, 0.1)", color: "#ef4444", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Target size={20} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 800 }}>Target Weak Concepts</h3>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Auto-detects &lt;55% Mastery</span>
                  </div>
                </div>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  Compiles an adaptive diagnostic quiz focused on your lowest-scoring curriculum areas.
                </p>
              </div>

              <div
                onClick={() => setQuizType("topic_mastery")}
                className="glass"
                style={{
                  padding: 20,
                  borderRadius: 16,
                  cursor: "pointer",
                  border: quizType === "topic_mastery" ? "2px solid var(--accent)" : "1px solid var(--border)",
                  background: quizType === "topic_mastery" ? "rgba(139, 92, 246, 0.08)" : "var(--bg-card)",
                  transition: "all 0.2s ease"
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                  <div style={{ width: 38, height: 38, borderRadius: 10, background: "rgba(139, 92, 246, 0.1)", color: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Brain size={20} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 800 }}>Custom Mastery Studio</h3>
                    <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Pick Course or Custom Focus</span>
                  </div>
                </div>
                <p style={{ fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                  Choose a specific topic, concept, or document you want to master at your desired difficulty.
                </p>
              </div>
            </div>

            {/* Generator Form */}
            <div className="glass" style={{ padding: 28, borderRadius: 20 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, marginBottom: 20, display: "flex", alignItems: "center", gap: 8 }}>
                <Zap size={18} color="var(--accent)" /> Practice Session Configuration
              </h2>

              {/* Course Selection */}
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 8 }}>
                  1. Enrolled Course Context
                </label>
                <select
                  value={selectedCourse}
                  onChange={(e) => setSelectedCourse(e.target.value ? Number(e.target.value) : "")}
                  style={{
                    width: "100%",
                    padding: "12px 14px",
                    borderRadius: 12,
                    background: "var(--bg-primary)",
                    border: "1px solid var(--border)",
                    color: "var(--text-primary)",
                    fontSize: 14,
                    outline: "none"
                  }}
                >
                  <option value="">All Institutional Courses (Combined RAG)</option>
                  {recommendations.courses.map((c: any) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.section ? `(Section ${c.section})` : ""}
                    </option>
                  ))}
                </select>
              </div>

              {/* Target Concept Selection (if Weak Concepts or Topic Mastery) */}
              {quizType === "weak_concepts" ? (
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 8 }}>
                    2. Auto-Identified Target Weaknesses
                  </label>
                  {recommendations.weak_concepts.length > 0 ? (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {recommendations.weak_concepts.map((w: any) => (
                        <div
                          key={w.concept}
                          onClick={() => setSelectedConcept(selectedConcept === w.concept ? "" : w.concept)}
                          style={{
                            padding: "6px 14px",
                            borderRadius: 20,
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: "pointer",
                            border: selectedConcept === w.concept ? "2px solid #ef4444" : "1px solid rgba(239, 68, 68, 0.3)",
                            background: selectedConcept === w.concept ? "rgba(239, 68, 68, 0.15)" : "rgba(239, 68, 68, 0.05)",
                            color: "#ef4444",
                            display: "flex",
                            alignItems: "center",
                            gap: 6
                          }}
                        >
                          <AlertCircle size={13} />
                          {w.concept} ({w.avg_score}%)
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p style={{ fontSize: 13, color: "var(--text-muted)", fontStyle: "italic" }}>
                      🎉 Great job! No critical weaknesses detected (&lt;55%). All concepts will be reviewed diagnostically.
                    </p>
                  )}
                </div>
              ) : (
                <div style={{ marginBottom: 20 }}>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 8 }}>
                    2. Specific Concept or Topic to Master
                  </label>

                  {/* Available topics pills */}
                  {recommendations.available_topics.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
                      {recommendations.available_topics.slice(0, 6).map((t: any) => (
                        <span
                          key={t.material_id}
                          onClick={() => setCustomConcept(t.title)}
                          style={{
                            padding: "4px 10px",
                            borderRadius: 16,
                            fontSize: 12,
                            cursor: "pointer",
                            background: customConcept === t.title ? "var(--accent)" : "rgba(0,0,0,0.05)",
                            color: customConcept === t.title ? "#fff" : "var(--text-secondary)",
                            border: "1px solid var(--border)"
                          }}
                        >
                          {t.title}
                        </span>
                      ))}
                    </div>
                  )}

                  <input
                    type="text"
                    placeholder="e.g., ESG Investment Criteria, Recursion Trees, Bond Valuation..."
                    value={customConcept}
                    onChange={(e) => setCustomConcept(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      borderRadius: 12,
                      background: "var(--bg-primary)",
                      border: "1px solid var(--border)",
                      color: "var(--text-primary)",
                      fontSize: 14,
                      outline: "none"
                    }}
                  />
                </div>
              )}

              {/* Difficulty & Count Grid */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 24 }}>
                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 8 }}>
                    3. Target Difficulty
                  </label>
                  <select
                    value={difficulty}
                    onChange={(e) => setDifficulty(e.target.value)}
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      borderRadius: 12,
                      background: "var(--bg-primary)",
                      border: "1px solid var(--border)",
                      color: "var(--text-primary)",
                      fontSize: 14,
                      outline: "none"
                    }}
                  >
                    <option value="adaptive">⚡ Adaptive (Auto-Scales as You Answer)</option>
                    <option value="foundational">🌱 Foundational (Core Principles)</option>
                    <option value="intermediate">⚖️ Intermediate (Application)</option>
                    <option value="advanced">🔥 Advanced Challenge (Synthesis & Analysis)</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 8 }}>
                    4. Practice Format
                  </label>
                  <select
                    value={quizMode}
                    onChange={(e) => setQuizMode(e.target.value as any)}
                    style={{
                      width: "100%",
                      padding: "12px 14px",
                      borderRadius: 12,
                      background: "var(--bg-primary)",
                      border: "1px solid var(--border)",
                      color: "var(--text-primary)",
                      fontSize: 14,
                      outline: "none"
                    }}
                  >
                    <option value="standard_quiz">📝 Structured Practice Quiz (Instant Grading)</option>
                    <option value="interactive_socratic">💬 Interactive Socratic Chat Viva</option>
                  </select>
                </div>
              </div>

              {/* Generate Button */}
              <button
                onClick={handleGenerateQuiz}
                disabled={isGenerating}
                className="btn-primary"
                style={{
                  width: "100%",
                  padding: "14px 24px",
                  fontSize: 15,
                  borderRadius: 12,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 10
                }}
              >
                {isGenerating ? (
                  <>
                    <RefreshCw size={18} className="spin" /> Generating Adaptive Practice Session...
                  </>
                ) : (
                  <>
                    <Sparkles size={18} /> Launch Adaptive Practice Quiz
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Right Column: Recommendations & Past History */}
          <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
            {/* Mastery Snapshot */}
            <div className="glass" style={{ padding: 24, borderRadius: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                <Award size={18} color="var(--accent)" /> Concept Mastery Overview
              </h3>

              {recommendations.mastered_concepts.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "var(--success)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                    Strong Concepts (≥75%)
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {recommendations.mastered_concepts.map((m: any) => (
                      <span key={m.concept} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 12, background: "rgba(16, 185, 129, 0.1)", color: "#10b981", fontWeight: 600 }}>
                        {m.concept} ({m.avg_score}%)
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {recommendations.weak_concepts.length > 0 && (
                <div>
                  <p style={{ fontSize: 12, fontWeight: 700, color: "#ef4444", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 8 }}>
                    Needs Strengthening (&lt;55%)
                  </p>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {recommendations.weak_concepts.map((w: any) => (
                      <span key={w.concept} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 12, background: "rgba(239, 68, 68, 0.1)", color: "#ef4444", fontWeight: 600 }}>
                        {w.concept} ({w.avg_score}%)
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Past Quizzes */}
            <div className="glass" style={{ padding: 24, borderRadius: 20 }}>
              <h3 style={{ fontSize: 16, fontWeight: 800, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                <Layers size={18} color="var(--accent)" /> Practice History
              </h3>

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {pastQuizzes.map((q) => (
                  <div
                    key={q.id}
                    onClick={() => loadPastQuiz(q.id)}
                    className="glass-hover"
                    style={{
                      padding: 14,
                      borderRadius: 12,
                      cursor: "pointer",
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center"
                    }}
                  >
                    <div>
                      <h4 style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{q.title}</h4>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>
                        {new Date(q.created_at).toLocaleDateString()} • {q.question_count} Questions
                      </span>
                    </div>
                    {q.status === "completed" ? (
                      <span style={{ fontSize: 13, fontWeight: 900, color: q.score >= 70 ? "#10b981" : "#f59e0b" }}>
                        {q.score}%
                      </span>
                    ) : (
                      <span className="tag" style={{ fontSize: 10 }}>Pending</span>
                    )}
                  </div>
                ))}

                {pastQuizzes.length === 0 && (
                  <p style={{ fontSize: 13, color: "var(--text-muted)", textAlign: "center", padding: 20 }}>
                    No practice quizzes generated yet. Launch your first quiz above!
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Active Practice Quiz Player View */
        <div className="fade-in" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Quiz Metadata Top Bar */}
          <div className="glass" style={{ padding: 24, borderRadius: 20, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span className="tag tag-purple">{activeQuiz.difficulty.toUpperCase()}</span>
                <span className="tag tag-blue">{activeQuiz.quiz_type.toUpperCase()}</span>
              </div>
              <h2 style={{ fontSize: 24, fontWeight: 900 }}>{activeQuiz.title}</h2>
              <p style={{ fontSize: 13, color: "var(--text-secondary)", marginTop: 4 }}>
                Target Concepts: {activeQuiz.target_concepts.join(", ")}
              </p>
            </div>

            {evaluationResult ? (
              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: 12, color: "var(--text-muted)", display: "block" }}>Overall Score</span>
                <span style={{ fontSize: 36, fontWeight: 900, color: evaluationResult.score >= 70 ? "#10b981" : "#f59e0b" }}>
                  {evaluationResult.score}%
                </span>
              </div>
            ) : (
              <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--text-secondary)" }}>
                  Question {currentQIndex + 1} of {activeQuiz.questions.length}
                </span>
                <button
                  onClick={handleSubmitQuiz}
                  disabled={isSubmitting}
                  className="btn-primary"
                  style={{ padding: "10px 20px", fontSize: 14 }}
                >
                  {isSubmitting ? "Grading..." : "Submit Practice Quiz"}
                </button>
              </div>
            )}
          </div>

          {/* Question Display Card */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 24 }}>
            {activeQuiz.questions.map((q, idx) => {
              const evalInfo = evaluationResult?.evaluation?.find((e: any) => e.question_id === q.id);
              const isCurrent = idx === currentQIndex || evaluationResult !== null;

              if (!isCurrent) return null;

              return (
                <motion.div
                  key={q.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="glass"
                  style={{ padding: 32, borderRadius: 20 }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
                    <span style={{ fontSize: 13, fontWeight: 800, color: "var(--accent)" }}>
                      QUESTION {idx + 1} • {q.concept || "Concept Mastery"}
                    </span>
                    {q.hint && !evalInfo && (
                      <button
                        onClick={() => setShownHints((prev) => ({ ...prev, [q.id]: !prev[q.id] }))}
                        style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}
                      >
                        <HelpCircle size={14} /> {shownHints[q.id] ? "Hide Hint" : "Need a Hint?"}
                      </button>
                    )}
                  </div>

                  <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 24, lineHeight: 1.5 }}>
                    {q.question}
                  </h3>

                  {shownHints[q.id] && q.hint && (
                    <div style={{ padding: "12px 16px", borderRadius: 12, background: "rgba(139, 92, 246, 0.08)", border: "1px solid rgba(139, 92, 246, 0.2)", color: "var(--accent)", fontSize: 13, marginBottom: 20 }}>
                      💡 <strong>Hint:</strong> {q.hint}
                    </div>
                  )}

                  {/* Multiple Choice Options */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 24 }}>
                    {q.options.map((opt, optIdx) => {
                      const isSelected = userAnswers[q.id] === optIdx;
                      let optionBg = "var(--bg-primary)";
                      let optionBorder = "1px solid var(--border)";

                      if (evalInfo) {
                        if (optIdx === evalInfo.correct_index) {
                          optionBg = "rgba(16, 185, 129, 0.12)";
                          optionBorder = "2px solid #10b981";
                        } else if (isSelected && !evalInfo.is_correct) {
                          optionBg = "rgba(239, 68, 68, 0.12)";
                          optionBorder = "2px solid #ef4444";
                        }
                      } else if (isSelected) {
                        optionBg = "rgba(139, 92, 246, 0.1)";
                        optionBorder = "2px solid var(--accent)";
                      }

                      return (
                        <div
                          key={optIdx}
                          onClick={() => handleSelectOption(q.id, optIdx)}
                          style={{
                            padding: "16px 20px",
                            borderRadius: 14,
                            cursor: evalInfo ? "default" : "pointer",
                            background: optionBg,
                            border: optionBorder,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            transition: "all 0.15s ease"
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                            <div
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: "50%",
                                border: isSelected ? "2px solid var(--accent)" : "1px solid var(--border)",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 13,
                                fontWeight: 700,
                                background: isSelected ? "var(--accent)" : "transparent",
                                color: isSelected ? "#fff" : "var(--text-secondary)"
                              }}
                            >
                              {String.fromCharCode(65 + optIdx)}
                            </div>
                            <span style={{ fontSize: 15, fontWeight: 500 }}>{opt}</span>
                          </div>

                          {evalInfo && optIdx === evalInfo.correct_index && (
                            <CheckCircle2 size={20} color="#10b981" />
                          )}
                          {evalInfo && isSelected && !evalInfo.is_correct && (
                            <XCircle size={20} color="#ef4444" />
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* AI Explanation Card after evaluation */}
                  {evalInfo && (
                    <div
                      style={{
                        padding: 20,
                        borderRadius: 14,
                        background: evalInfo.is_correct ? "rgba(16, 185, 129, 0.05)" : "rgba(239, 68, 68, 0.05)",
                        border: `1px solid ${evalInfo.is_correct ? "rgba(16, 185, 129, 0.2)" : "rgba(239, 68, 68, 0.2)"}`
                      }}
                    >
                      <h4 style={{ fontSize: 14, fontWeight: 800, marginBottom: 6, color: evalInfo.is_correct ? "#10b981" : "#ef4444" }}>
                        {evalInfo.is_correct ? "✓ Correct Solution" : "✗ Concept Breakdown & Explanation"}
                      </h4>
                      <p style={{ fontSize: 14, color: "var(--text-secondary)", lineHeight: 1.6 }}>
                        {evalInfo.explanation}
                      </p>
                    </div>
                  )}

                  {/* Question Navigation */}
                  {!evaluationResult && (
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 24 }}>
                      <button
                        disabled={currentQIndex === 0}
                        onClick={() => setCurrentQIndex((prev) => prev - 1)}
                        className="btn-ghost"
                        style={{ padding: "8px 16px", fontSize: 13 }}
                      >
                        Previous
                      </button>

                      {currentQIndex < activeQuiz.questions.length - 1 ? (
                        <button
                          onClick={() => setCurrentQIndex((prev) => prev + 1)}
                          className="btn-primary"
                          style={{ padding: "8px 20px", fontSize: 13 }}
                        >
                          Next Question →
                        </button>
                      ) : (
                        <button
                          onClick={handleSubmitQuiz}
                          disabled={isSubmitting}
                          className="btn-primary"
                          style={{ padding: "8px 20px", fontSize: 13 }}
                        >
                          Submit & Grade Quiz
                        </button>
                      )}
                    </div>
                  )}
                </motion.div>
              );
            })}
          </div>

          {/* Post-Submit Mastery Growth Summary */}
          {evaluationResult && (
            <div className="glass" style={{ padding: 28, borderRadius: 20 }}>
              <h3 style={{ fontSize: 18, fontWeight: 800, marginBottom: 16, display: "flex", alignItems: "center", gap: 8 }}>
                <BarChart2 size={20} color="var(--accent)" /> Real-Time Mastery Progress Updates
              </h3>

              <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
                {Object.entries(evaluationResult.concept_updates || {}).map(([c, val]: any) => (
                  <div key={c} className="glass" style={{ padding: "12px 18px", borderRadius: 14, display: "flex", alignItems: "center", gap: 12 }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 700, display: "block" }}>{c}</span>
                      <span style={{ fontSize: 11, color: "var(--text-muted)" }}>Mastery Updated</span>
                    </div>
                    <span className="tag tag-purple" style={{ fontSize: 14, fontWeight: 800 }}>
                      {val}%
                    </span>
                  </div>
                ))}
              </div>

              <div style={{ display: "flex", gap: 16 }}>
                <button
                  onClick={() => { setActiveQuiz(null); setEvaluationResult(null); }}
                  className="btn-primary"
                  style={{ padding: "12px 24px", fontSize: 14 }}
                >
                  Generate Another Adaptive Session
                </button>
                <button
                  onClick={() => router.push("/dashboard/progress")}
                  className="btn-ghost"
                  style={{ padding: "12px 24px", fontSize: 14 }}
                >
                  View Updated Mastery Dashboard →
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
