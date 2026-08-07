/**
 * Canonical BibTeX for mcpindex research artifacts.
 * Prefer concept DOIs (resolve to latest) except where a frozen edition
 * must stay bit-checkable — then pin the version DOI used on that page.
 */

export type Citation = {
  /** Short label shown above the block */
  label: string;
  bibtex: string;
};

export const CITATION_PAPER: Citation = {
  label: 'Paper',
  bibtex: `@misc{bharti2026drift,
  author       = {Bharti, Gautam},
  title        = {Registry Descriptions Go Stale Unevenly: An 89-Day Measurement of
                  Model Context Protocol Drift, and Why Drift-Ranked Re-Auditing Under-Covers It},
  year         = {2026},
  eprint       = {2608.00997},
  archivePrefix= {arXiv},
  primaryClass = {cs.SE},
  doi          = {10.48550/arXiv.2608.00997},
  url          = {https://arxiv.org/abs/2608.00997}
}`,
};

export const CITATION_PANEL: Citation = {
  label: 'Panel dataset',
  bibtex: `@dataset{bharti2026panel,
  author    = {Bharti, Gautam},
  title     = {MCP Registry Drift Panel v1},
  year      = {2026},
  publisher = {Zenodo},
  doi       = {10.5281/zenodo.21709945},
  url       = {https://doi.org/10.5281/zenodo.21709945},
  note      = {Concept DOI; resolves to the latest version. CC-BY-4.0}
}`,
};

/** Frozen Edition v1 — version DOI so cited figures stay checkable. */
export const CITATION_DRIFT_REPORT_EDITION_V1: Citation = {
  label: 'Drift Report · Edition v1',
  bibtex: `@dataset{bharti2026driftreport,
  author    = {Bharti, Gautam},
  title     = {mcpindex Drift Report -- Edition v1 dataset},
  year      = {2026},
  publisher = {Zenodo},
  doi       = {10.5281/zenodo.21449150},
  url       = {https://doi.org/10.5281/zenodo.21449150},
  note      = {Frozen Edition v1 (2026-07-19). Concept DOI 10.5281/zenodo.21449149 resolves to the latest version. CC-BY-4.0. Live: https://mcpindex.ai/drift-report}
}`,
};

export const CITATION_SOURCE_LIVENESS: Citation = {
  label: 'Source Liveness · Baseline v1',
  bibtex: `@dataset{bharti2026liveness,
  author    = {Bharti, Gautam},
  title     = {mcpindex Source Liveness -- Baseline v1: a corroborated, timestamp-anchored
              census of source reachability in the Model Context Protocol registry},
  year      = {2026},
  publisher = {Zenodo},
  doi       = {10.5281/zenodo.21501867},
  url       = {https://doi.org/10.5281/zenodo.21501867},
  note      = {Concept DOI; resolves to the latest version. CC-BY-4.0. Live: https://mcpindex.ai/research/source-liveness}
}`,
};

export const CITATION_DECLARED_EFFECT: Citation = {
  label: 'Declared-Effect / Contract Binding',
  bibtex: `@dataset{bharti2026binding,
  author    = {Bharti, Gautam},
  title     = {MCP Declared-Effect Coverage and Contract Binding v1},
  year      = {2026},
  publisher = {Zenodo},
  doi       = {10.5281/zenodo.21778281},
  url       = {https://doi.org/10.5281/zenodo.21778281},
  note      = {Concept DOI; resolves to the latest version. CC-BY-4.0}
}`,
};
