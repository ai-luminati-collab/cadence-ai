const { OpenAI } = require('openai');
require('dotenv').config({ path: '.env.local' });
async function test() {
  try {
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    await openai.chat.completions.create({
      model: "gpt-5.4-mini",
      messages: [{ role: "user", content: "hi" }]
    });
    console.log("SUCCESS");
  } catch(e) {
    console.log("ERROR", e.message);
  }
}
test();
