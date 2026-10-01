export type DirectoryPerson = {
  aadOid: string;
  email: string;
  displayName: string;
};

export interface DirectoryProvider {
  readonly mode: "mock" | "graph";
  search(
    query: string,
    limit?: number,
    accessToken?: string,
  ): Promise<DirectoryPerson[]>;
}
