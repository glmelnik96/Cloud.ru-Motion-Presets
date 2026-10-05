// The catalog check the panel injects into parseLibrary (plan P8): the pipeline's own cross-field rules over the
// standalone Ajv validator generated from the schemas, so the panel accepts exactly the catalogs
// tools/library/validate.mjs accepts. Vite bundles both modules; neither touches fs or Node.
import { checkLibrary } from '../../../tools/library/rules.mjs';
import { validateCatalogSchema } from '../generated/catalog-validate.mjs';
import type { Validation } from './library';

export function validateCatalog(doc: unknown): Validation {
  const { ok, errors } = checkLibrary(doc, 'catalog', validateCatalogSchema);
  return { ok, errors };
}
