import type { GraphQLReadMeta, PageRequestTrace } from "./graphql.service";

export interface ServiceReadOptions {
  forceRefresh?: boolean;
  trace?: PageRequestTrace;
}

export interface DomainRead<T> {
  data: T;
  meta: GraphQLReadMeta;
}
