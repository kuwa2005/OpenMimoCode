import z from "zod"
import { Effect } from "effect"
import * as Tool from "./tool"
import { Question } from "../question"
import * as ConfigAutonomy from "@/config/autonomy"
import { goalRef } from "../session/goal-ref"
import DESCRIPTION from "./question.txt"

const parameters = z.object({
  questions: z.array(Question.Prompt.zod).describe("Questions to ask"),
})

type Metadata = {
  answers: ReadonlyArray<Question.Answer>
  requirementsLocked?: boolean
}

export const QuestionTool = Tool.define<typeof parameters, Metadata, Question.Service>(
  "question",
  Effect.gen(function* () {
    const question = yield* Question.Service

    return {
      description: DESCRIPTION,
      parameters,
      execute: (params: z.infer<typeof parameters>, ctx: Tool.Context<Metadata>) =>
        Effect.gen(function* () {
          // never-ask mode: the tool stays visible so the model keeps routing
          // every decision through it, but instead of blocking for a human we
          // hand the decision back to the model — it knows which option fits
          // headless execution better than a hardcoded pick would.
          if (yield* question.neverAsk()) {
            const autoAnswer = "[Never-Ask] The model will decide autonomously"
            return {
              title: `Auto-resolved ${params.questions.length} question${params.questions.length > 1 ? "s" : ""}`,
              output:
                "[Never-Ask] No user is available to answer (never-ask mode is on). " +
                "Re-evaluate the options you just proposed for unattended/headless execution — " +
                "prefer text-only, non-interactive, minimal-scope paths and avoid anything that needs a GUI or the user to be present. " +
                "Pick the best option yourself and continue. " +
                "IMPORTANT: You MUST explicitly state which option you chose and why in your response text (not just in thinking) — " +
                "the user will review the conversation history later and needs to see what you decided without expanding thinking blocks. " +
                "This applies only to this question; never-ask may be turned off later, so keep using the question tool at future decision points (the user may have returned).",
              metadata: {
                answers: params.questions.map(() => [autoAnswer]),
              },
            }
          }

          const answers = yield* question.ask({
            sessionID: ctx.sessionID,
            questions: params.questions,
            tool: ctx.callID ? { messageID: ctx.messageID, callID: ctx.callID } : undefined,
          })

          const formatted = params.questions
            .map((q, i) => `"${q.question}"="${answers[i]?.length ? answers[i].join(", ") : "Unanswered"}"`)
            .join(", ")

          // Requirements Lock gate: affirmative answer advances autonomy hearing → execute.
          const lockAsked = params.questions.some((q) => ConfigAutonomy.isRequirementsLockHeader(q.header))
          const locked = lockAsked && ConfigAutonomy.isLockApproval(answers)
          if (locked) {
            goalRef.setPhase(ctx.sessionID, "execute")
          }

          return {
            title: `Asked ${params.questions.length} question${params.questions.length > 1 ? "s" : ""}`,
            output: locked
              ? `User has answered your questions: ${formatted}. Requirements Lock approved — hearing phase is complete. Enable non-stop execution: implement, verify, and finish. Do not ask further product-scope questions unless blocked.`
              : `User has answered your questions: ${formatted}. You can now continue with the user's answers in mind. Record each Q&A (why / background / result) in the hearing log before proceeding.`,
            metadata: {
              answers,
              requirementsLocked: locked || undefined,
            },
          }
        }).pipe(Effect.orDie),
    }
  }),
)
