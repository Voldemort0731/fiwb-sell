"""
PromptArchitect - ported from fiwb-mvp reference architecture.
Assembles context chunks into a structured LLM prompt.
"""
from typing import List, Dict, Optional


class PromptArchitect:
    """
    Builds a high-fidelity, multi-message conversation for the Socratic Mentor.
    Directly ported from the reference MVP's prompt_architect.py.
    """

    @staticmethod
    def build_messages(
        user_query: str,
        retrieved_chunks: List[Dict],
        assistant_knowledge: List[Dict] = None,
        chat_assets: List[Dict] = None,
        memories: List[Dict] = None,
        profile: List[Dict] = None,
        history: List[Dict] = None,
        attachment_text: str = None,
        query_type: str = "academic_question",
        material_id: str = None,
        image_base64: str = None,
        citation_map: Dict = None,
        mastery: Dict = None,
    ) -> List[Dict]:
        """
        Builds a high-fidelity, multi-message conversation for the Socratic Institutional Mentor.
        """
        
        # 1. ORCHESTRATE ACADEMIC CONTEXT (Grouped by Document)
        context_blocks = []
        docs = {}
        
        # Inject immediate attachment text if provided (Analysis mode)
        if attachment_text:
            docs["CURRENT_DOCUMENT"] = {
                "title": "Currently Viewed Document",
                "course": "Analysis Workspace",
                "category": "PRIMARY SOURCE",
                "chunks": [attachment_text],
                "link": None,
            }

        for c in (retrieved_chunks or []):
            meta = c.get('metadata', {})
            source_id = meta.get('source_id') or meta.get('documentId')
            
            if material_id and source_id == material_id and attachment_text:
                continue
            
            base_title = meta.get('title') or meta.get('file_name') or meta.get('course') or "Institutional Document"
            course_name = meta.get('course') or meta.get('course_name') or ""
            unique_name = f"{base_title} [{course_name}]" if course_name else base_title
            doc_key = source_id or meta.get('file_name') or unique_name
            
            # Read passage_id stamped by chat.py (no fragile text matching needed)
            passage_id = meta.get('passage_id')
            
            if doc_key not in docs:
                docs[doc_key] = {
                    "title": unique_name,
                    "course": course_name or "General Workspace",
                    "category": meta.get('type', 'Institutional Material'),
                    "link": meta.get('source_link') or meta.get('url'),
                    "chunks": []
                }
            chunk_text = c.get('content', '')
            if passage_id and not docs[doc_key]["chunks"]:
                # ONLY ANNOTATE THE FIRST CHUNK OF THE DOC TO ENFORCE ONE-CITATIONS-PER-DOC
                chunk_text = f"[PASSAGE_ID:{passage_id}]\n{chunk_text}"
            docs[doc_key]["chunks"].append(chunk_text)
        
        for d_info in docs.values():
            content = "\n\n".join(d_info["chunks"])
            cat_label = str(d_info['category']).upper()
            block = f"[{cat_label} | {d_info['course']}]\n"
            block += f"DOCUMENT: {d_info['title']}\n"
            if d_info['link']: block += f"LINK: {d_info['link']}\n"
            block += f"CONTENT: {content}"
            context_blocks.append(block)
        
        knowledge_base = "\n\n---\n\n".join(context_blocks) if context_blocks else "General academic intelligence."

        # 2. ORCHESTRATE ASSISTANT KNOWLEDGE
        assistant_blocks = []
        for ak in (assistant_knowledge or []):
            meta = ak.get('metadata', {})
            label = meta.get('type', 'INTEL').upper()
            subject = meta.get('subject') or meta.get('title') or "Workspace Item"
            assistant_blocks.append(f"[{label} | {subject}]\nCONTEXT: {ak.get('content', '')}")
        
        for asset in (chat_assets or []):
            meta = asset.get('metadata', {})
            fname = meta.get('file_name', 'Previous Asset')
            assistant_blocks.append(f"[PAST ASSET | {fname}]\nCONTENT: {asset.get('content')}")

        assistant_workspace = "\n\n".join(assistant_blocks) if assistant_blocks else "No proprietary workspace context detected."

        # 3. ORCHESTRATE LONG-TERM COGNITION
        memory_vault = "\n".join([f"• {m.get('content')}" for m in (memories or [])]) if memories else "Establish prior student context."
        identity_logic = "\n".join([f"• {p.get('content')}" for p in (profile or [])]) if profile else "Analyze learning behavior."

        # 4. DEFINE SYSTEM PROMPT (Authoritative Directives)
        if query_type == "general_chat":
            SYSTEM_PROMPT = f"""
# IDENTITY: FIWB Companion
You are the student's supportive and empathetic Digital Twin. You use a warm and relatable tone.

# PROPRIETARY WORKSPACE:
{assistant_workspace}

# ACADEMIC / DRIVE CONTEXT:
{knowledge_base}

# COGNITIVE CONTEXT:
- Learned Identity: {identity_logic}
- Past Insights: {memory_vault}

# DIRECTIVE:
1. Be empathetic and supportive. 
2. Reference tasks or events from the workspace if relevant.
3. If referencing institutional items, use their full titles: Title [Course].

# VISUAL EXCELLENCE:
- Use bullet points and **bold** terminology for emphasis.
- Keep responses concise and well-spaced.
"""
        elif query_type == "viva":
            viva_objective = mastery.get("viva_objective", "Evaluate student's depth of understanding.")
            SYSTEM_PROMPT = f"""
# IDENTITY: FIWB Socratic Assessor (Viva Mode)
You are an elite, impartial academic evaluator. Your goal is to conduct a "Viva Voce" (oral examination) through chat to determine a student's true depth of understanding.

# VIVA OBJECTIVES (Professor Set):
{viva_objective}

# [CRITICAL] ACADEMIC VAULT (Grounding Materials):
{knowledge_base}

# STUDENT DIGITAL TWIN:
- Past Performance: {mastery.get('recent_metrics', []) if mastery else 'None.'}

# VIVA CONDUCT DIRECTIVES:
1. **The Probe**: Do NOT give answers. Do NOT explain concepts unless the student is fundamentally stuck. Your primary tool is the question.
2. **Depth Assessment**: If a student gives a shallow or surface answer, push for reasoning. Ask "Why?", "How does this connect to X?", or "What happens if we change Y?".
3. **Edge Case Pressure**: For strong students, push into edge cases, applications, or cross-disciplinary links not explicitly in the prompt.
4. **Misconception Detection**: If the student is wrong, don't just mark it incorrect. Probe to find if the breakdown is a misconception, a prerequisite gap, or unclear thinking.
5. **No Scaffolding**: Unlike normal tutoring, provide MINIMAL scaffolding. You are evaluating what they know, not helping them solve it.
6. **Strict Evidence**: Citations are required. If the student makes a claim that contradicts the Academic Vault, probe them on the source material.

# [CRITICAL] COMPLETION TRIGGER:
If you feel the student has sufficiently demonstrated mastery (or total failure) across all objectives, end your final response with: "[VIVA_COMPLETE: SUCCESS]" or "[VIVA_COMPLETE: REVIEW_NEEDED]".

# FORMATTING:
- Use bullet points for structured probing.
- One citation per document at the end.
"""
        else:
            SYSTEM_PROMPT = f"""
# IDENTITY: FIWB Institutional Intelligence (FIWB-II)
You are an elite academic mentor and Socratic tutor. 

# [CRITICAL] ACADEMIC VAULT (Verified Course Materials):
{knowledge_base}

# [SECONDARY] ASSISTANT WORKSPACE:
{assistant_workspace}

# [DIGITAL TWIN] PERSONALIZED INTELLIGENCE:
- Student Profile: {identity_logic}
- Behavioral Memories: {memory_vault}
- Recent Performance: {mastery.get('recent_metrics', []) if mastery else 'None recorded.'}
- Concept Mastery: {mastery.get('concept_scores', {}) if mastery else 'None recorded.'}

# ADAPTIVE TUTORING DIRECTIVES:
1. **Prerequisite Gating**: If the student shows gaps in prerequisite concepts (found in concept mastery), prioritize foundational clarification over advanced problem-solving.
2. **Mastery Challenge**: If concept mastery is consistently high, increase complexity and push for multi-disciplinary applications.
3. **Soft Enforcement**: If the student is struggling, gently pivot the conversation to a prerequisite concept found in the Academic Vault. Do not just give the answer; find the breakdown.
4. **Scaffolding**: Provide appropriate scaffolding based on demonstrated competence.

# OPERATIONAL DIRECTIVES:
1. **[CRITICAL] NO INLINE CITATIONS**: You are strictly FORBIDDEN from placing `[[cite:PASSAGE_ID]]` anywhere inside your main text. 
2. **Citation Clustering**: All citations MUST be grouped at the VERY END under a "---" separator.
3. **Document-Level Citations**: Provide exactly ONE `[[cite:PASSAGE_ID]]` for each unique document you used. Use the exact PASSAGE_ID found in the context (e.g., if you see `[PASSAGE_ID:123:0]`, use `[[cite:123:0]]`).
4. **Clean Formatting**: Place citation tags side-by-side after the "**Sources:**" label. No dots or commas.
5. **Socratic Bridge**: End with a clarifying "Bridge Question" to ensure comprehension.
6. **Visual Excellence**: Use Markdown and LaTeX for clarity.

**[CRITICAL FORBIDDEN BEHAVIOUR]**: NEVER output an internal reasoning section or preamble. Start your response DIRECTLY.

<CITATION_STRICT_POLICY>
Your response must follow this EXACT structure:
[Your Socratic Answer Content...]

Bridge Question: [Your Question?]

---
**Sources:** [[cite:PASSAGE_ID]]
</CITATION_STRICT_POLICY>
"""

        # 🚀 FORCE VISION ANALYSIS IF IMAGE PRESENT
        if image_base64:
            SYSTEM_PROMPT += "\n\n# [CRITICAL VISION INSTRUCTION]\nThe user has provided an image. You MUST directly analyze and describe it."

        messages = [{"role": "system", "content": SYSTEM_PROMPT.strip()}]

        # 5. INTEGRATE CONVERSATION HISTORY
        if history:
            for msg in history[-10:]:
                role = "user" if msg.get("role") == "user" else "assistant"
                messages.append({"role": role, "content": msg.get("content")})

        # 6. ATTACH LATEST QUERY
        final_query_content = []
        final_query_content.append({"type": "text", "text": user_query})
        
        # 🚀 MULTIMODAL VISION: Inject base64 image if user pasted one
        if image_base64:
            prefix = "data:image/jpeg;base64," if not image_base64.startswith("data:") else ""
            final_query_content.append({
                "type": "image_url",
                "image_url": {
                    "url": f"{prefix}{image_base64}"
                }
            })

        messages.append({"role": "user", "content": final_query_content})

        return messages
