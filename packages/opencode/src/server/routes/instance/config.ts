import { Hono } from "hono"
import { describeRoute, validator, resolver } from "hono-openapi"
import z from "zod"
import { Config } from "@/config"
import { Provider } from "@/provider"
import { Question } from "@/question"
import { Permission } from "@/permission"
import { Goal } from "@/session/goal"
import { errors } from "../../error"
import { lazy } from "@/util/lazy"
import { jsonRequest } from "./trace"

const AutonomyModeBody = z.object({
  mode: z.enum(["none", "normal", "special"]),
})

export const ConfigRoutes = lazy(() =>
  new Hono()
    .get(
      "/",
      describeRoute({
        summary: "Get configuration",
        description: "Retrieve the current OpenCode configuration settings and preferences.",
        operationId: "config.get",
        responses: {
          200: {
            description: "Get config info",
            content: {
              "application/json": {
                schema: resolver(Config.Info),
              },
            },
          },
        },
      }),
      async (c) =>
        jsonRequest("ConfigRoutes.get", c, function* () {
          const cfg = yield* Config.Service
          return yield* cfg.get()
        }),
    )
    .patch(
      "/",
      describeRoute({
        summary: "Update configuration",
        description: "Update OpenCode configuration settings and preferences.",
        operationId: "config.update",
        responses: {
          200: {
            description: "Successfully updated config",
            content: {
              "application/json": {
                schema: resolver(Config.Info),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("json", Config.Info),
      async (c) =>
        jsonRequest("ConfigRoutes.update", c, function* () {
          const config = c.req.valid("json")
          const cfg = yield* Config.Service
          yield* cfg.update(config)
          return config
        }),
    )
    .post(
      "/autonomy-mode",
      describeRoute({
        summary: "Set autonomy mode",
        description:
          "Switch none/normal/special without disposing the instance so in-flight session goals survive. Special enables never-ask, skip-permissions, and promotes goals to execute.",
        operationId: "config.autonomyMode",
        responses: {
          200: {
            description: "Updated config",
            content: {
              "application/json": {
                schema: resolver(
                  z.object({
                    config: Config.Info,
                    mode: z.enum(["none", "normal", "special"]),
                    goalsPromoted: z.number(),
                  }),
                ),
              },
            },
          },
          ...errors(400),
        },
      }),
      validator("json", AutonomyModeBody),
      async (c) =>
        jsonRequest("ConfigRoutes.autonomyMode", c, function* () {
          const mode = c.req.valid("json").mode
          const cfg = yield* Config.Service
          const config = yield* cfg.setAutonomyMode(mode)

          const question = yield* Question.Service
          const permission = yield* Permission.Service
          if (mode === "none") {
            yield* question.setNeverAsk(false)
            yield* permission.setSkipAll(false)
          }
          if (mode === "normal") {
            yield* question.setNeverAsk(false)
            yield* permission.setSkipAll(true)
          }
          let goalsPromoted = 0
          if (mode === "special") {
            yield* question.setNeverAsk(true)
            yield* permission.setSkipAll(true)
            const goal = yield* Goal.Service
            goalsPromoted = yield* goal.enterSpecialAll()
          }

          return { config, mode, goalsPromoted }
        }),
    )
    .get(
      "/providers",
      describeRoute({
        summary: "List config providers",
        description: "Get a list of all configured AI providers and their default models.",
        operationId: "config.providers",
        responses: {
          200: {
            description: "List of providers",
            content: {
              "application/json": {
                schema: resolver(Provider.ConfigProvidersResult.zod),
              },
            },
          },
        },
      }),
      async (c) =>
        jsonRequest("ConfigRoutes.providers", c, function* () {
          const svc = yield* Provider.Service
          const providers = yield* svc.list()
          return {
            providers: Object.values(providers),
            default: Provider.defaultModelIDs(providers),
          }
        }),
    ),
)
