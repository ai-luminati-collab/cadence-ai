import OpenAI from 'openai';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';


async function extractText() {
  const zipPath = "/Users/yashranka/Downloads/The brand strategy needs more impact and should be relatable and backed….pages";
  const extractDir = path.join(process.cwd(), '.temp_pages');
  
  if (!fs.existsSync(extractDir)) {
      fs.mkdirSync(extractDir);
  }

  // Unzip preview.jpg explicitly
  execSync(`unzip -o -j "${zipPath}" "preview.jpg" -d "${extractDir}"`);
  
  const imagePath = path.join(extractDir, 'preview.jpg');
  const base64Image = fs.readFileSync(imagePath).toString('base64');
  const mimeType = "image/jpeg";

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  
  console.log("Transcribing document via GPT Vision...");
  
  const response = await openai.chat.completions.create({
    model: "gpt-4o", // Need vision, gpt-4o or gpt-5.4 if it supports it. We'll use 4o for safety on vision
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "Please transcribe all the text in this document perfectly. Preserve the structure and paragraphs but output nothing but the text itself." },
          {
            type: "image_url",
            image_url: {
              url: `data:${mimeType};base64,${base64Image}`,
            },
          },
        ],
      },
    ],
  });

  console.log("=== TRANSCRIBED TEXT ===");
  console.log(response.choices[0]?.message?.content);
  console.log("================********/===");
}

extractText().catch(console.error);
