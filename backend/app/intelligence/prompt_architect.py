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
        image_base64: str = None
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
            
            if doc_key not in docs:
                docs[doc_key] = {
                    "title": unique_name,
                    "course": course_name or "General Workspace",
                    "category": meta.get('type', 'Institutional Material'),
                    "link": meta.get('source_link') or meta.get('url'),
                    "chunks": []
                }
            docs[doc_key]["chunks"].append(c.get('content', ''))
        
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

# OPERATIONAL DIRECTIVES:
6. **Citation**: Cite accurately as [From: Document Title].
7. **Socratic Bridge**: Guide the student. Do not just provide the answer; explain the path to it and probe with a clarifying "Bridge Question" at the end to ensure comprehension.
8. **TAGGING (START)**: You MUST start your response with: `### 🧠 Intelligence Reasoning` followed by your inner logic.
9. **TAGGING (END)**: You MUST conclude your response with a horizontal rule `---` followed by `### 📚 Sources` listing every document used with its clickable link (e.g., `1. [Document Name](LINK_URL_HERE) - Course Name`). If a link was provided in the context, YOU MUST include it.

# VISUAL EXCELLENCE:
- Use # H1 and ## H2 for hierarchy.
- Use bullet points and **bold** terminology for emphasis.
- **Mathematics**: You MUST use standard LaTeX. Use `$$` for block formulas (centered) and `$` for inline formulas (e.g., $E=mc^2$). **CRITICAL**: If the retrieved context contains math in other formats like `( ... )` or `[ ... ]`, YOU MUST convert them to `$` or `$$` respectively.
- **Tables**: Use Markdown tables for comparing concepts or representing structured data.
- **Code**: Always specify the language tag (e.g., ```cpp) for syntax highlighting.
- For complex solutions, use a "Solution Architecture" block (a bulleted list of steps).
- Ensure a clear separation between your reasoning, the main answer, and the source list.
"""

        # 🚀 FORCE VISION ANALYSIS IF IMAGE PRESENT
        if image_base64:
            SYSTEM_PROMPT += "\n\n# [CRITICAL VISION INSTRUCTION]\nThe user has provided an image. You MUST directly analyze, read, and describe the visual elements, charts, text, or layout of the image. Do not refuse visual analysis. Provide a direct analysis of the visual context."

        messages = [{"role": "system", "content": SYSTEM_PROMPT.strip()}]

        # 5. INTEGRATE CONVERSATION HISTORY
        if history:
            for msg in history[-10:]:
                role = "user" if msg.get("role") == "user" else "assistant"
                messages.append({"role": role, "content": msg.get("content")})

        # 6. ATTACH LATEST QUERY WITH DUAL GROUNDING
        final_query_content = []
        
        # 🚀 DUAL GROUNDING: Inject critical vault context into the user message too
        if query_type != "general_chat":
            final_query_content.append({
                "type": "text", 
                "text": f"# [CRITICAL] VITAL GROUNDING (ACADEMIC VAULT):\n{knowledge_base}\n\n---"
            })
            
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
