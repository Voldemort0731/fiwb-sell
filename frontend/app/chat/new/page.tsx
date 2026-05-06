"use client";
import ChatThread from "../[threadId]/page";
import { use } from "react";

export default function NewChatPage() {
  // Mock the params for the ChatThread component
  const params = Promise.resolve({ threadId: "new" });
  
  return <ChatThread params={params} />;
}
