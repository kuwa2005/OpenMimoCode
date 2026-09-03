export class RepoWorkspaceError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly repositoryId?: string,
  ) {
    super(message)
    this.name = "RepoWorkspaceError"
  }
}
