import { composeEvidenceLine } from "../../utils/evidence-state";
import type { EvidenceClass, EvidenceLabel } from "../../models/evidence";

/**
 * Single-line evidence footer (plan §8). Two ways in: a raw `text` override
 * for labels whose shape predates the contract, or structured props that
 * compose through composeEvidenceLine — either way the page only ever
 * attaches wording the client can verify (plan A6).
 */
Component({
  properties: {
    text: {
      type: String,
      value: ""
    },
    evidenceClass: {
      type: String,
      value: "UNKNOWN"
    },
    scope: {
      type: String,
      value: ""
    },
    exact: {
      type: Boolean,
      value: false
    },
    freshness: {
      type: String,
      value: ""
    },
    tone: {
      type: String,
      value: "muted"
    }
  },

  data: {
    line: ""
  },

  observers: {
    "text,evidenceClass,scope,exact,freshness": function () {
      this.syncLine();
    }
  },

  lifetimes: {
    attached() {
      this.syncLine();
    }
  },

  methods: {
    syncLine() {
      const text = this.properties.text;
      if (text) {
        this.setData({ line: text });
        return;
      }
      const label: EvidenceLabel = {
        evidenceClass: this.properties.evidenceClass as EvidenceClass,
        scopeText: this.properties.scope || undefined,
        exact: this.properties.exact === true ? true : undefined,
        freshnessText: this.properties.freshness || undefined
      };
      this.setData({ line: composeEvidenceLine(label) });
    }
  }
});
