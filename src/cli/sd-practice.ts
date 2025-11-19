// src/cli/sd-practice.ts
import readline from "readline";
import axios from "axios";

const BASE_URL = "http://localhost:3000/api/v1/system-design"; // adjust if your port/prefix differs

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(question: string): Promise<string> {
  return new Promise((resolve) => rl.question(question, resolve));
}

async function main() {
  try {
    console.log("=== System Design Co-Pilot CLI ===");
    const email = (await ask("Enter your email (used in the API): ")).trim();

    while (true) {
      const cmd = await ask(
        "\nPress [Enter] to get next question, or 'q' to quit: "
      );
      if (cmd.trim().toLowerCase() === "q") break;

      // 1) Ask backend for next question (agent-driven)
      const nextRes = await axios.post(`${BASE_URL}/next-question`, { email });
      const { sessionId, topic, difficulty, question, selectionReason } =
        nextRes.data;

      console.log("\n--- New System Design Question ---");
      console.log(`Topic: ${topic} (${difficulty})`);
      console.log(`Reason: ${selectionReason}`);
      console.log("\nQuestion:");
      console.log(question);

      console.log(
        "\nType your answer. End with a single line containing only 'END'."
      );
      const lines: string[] = [];
      while (true) {
        const line = await ask("");
        if (line.trim() === "END") break;
        lines.push(line);
      }
      const answer = lines.join("\n");

      // 2) Submit answer
      const submitRes = await axios.post(`${BASE_URL}/submit-answer`, {
        sessionId,
        answer,
      });

      // API currently returns evaluation fields at the root level
      const evaluation = submitRes.data;

      console.log("\n--- Auto Evaluation ---");
      console.log(`Score: ${evaluation.score}/10`);

      if (evaluation.strengths?.length) {
        console.log("Strengths:");
        evaluation.strengths.forEach((s: string) => console.log(`  - ${s}`));
      }

      if (evaluation.weaknesses?.length) {
        console.log("Weaknesses:");
        evaluation.weaknesses.forEach((w: string) => console.log(`  - ${w}`));
      }

      // 3) Get coach feedback
      try {
        console.log("\n[DEBUG] About to call /coach...");
        const coachRes = await axios.post(`${BASE_URL}/coach`, {
          email,
          sessionId,
        });

        const coach = coachRes.data.coachFeedback;
        console.log("\n--- Coach Feedback ---");
        console.log(coach.summary);
        if (coach.whatToImproveNextTime?.length) {
          console.log("\nFocus next on:");
          coach.whatToImproveNextTime.forEach((item: string) =>
            console.log(`  - ${item}`)
          );
        }
      } catch (err: any) {
        console.error(
          "\nError calling coach endpoint:",
          err.response?.data ?? err.message ?? err
        );
      }

      console.log("\n=============================================");
    }
  } catch (err: any) {
    console.error("CLI error:", err.message ?? err);
  } finally {
    rl.close();
  }
}

main();
