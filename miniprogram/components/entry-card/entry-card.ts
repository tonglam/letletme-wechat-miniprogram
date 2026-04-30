interface EntryCardInfo {
  entry?: number;
  entryId?: number;
  playerName?: string;
  entryName?: string;
  teamName?: string;
  region?: string;
  overallRank?: number;
  totalPoints?: number;
  totalTransfers?: number;
  bank?: number;
  teamValue?: number;
}

interface StatRow {
  label: string;
  value: string;
}

function formatNumber(value?: number): string {
  return typeof value === "number" ? String(value) : "-";
}

function formatRank(value?: number): string {
  if (typeof value !== "number") {
    return "-";
  }

  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1).replace(/\.0$/, "")}m`;
  }

  if (value >= 1000) {
    return `${(value / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  }

  return String(value);
}

function formatCurrency(value?: number): string {
  return typeof value === "number" ? `£${(value / 10).toFixed(1)}m` : "-";
}

Component({
  properties: {
    entry: {
      type: Object,
      value: {}
    },
    compact: {
      type: Boolean,
      value: false
    },
    rich: {
      type: Boolean,
      value: false
    }
  },

  data: {
    statRows: [] as StatRow[],
    entryMetaText: "",
    transferText: ""
  },

  observers: {
    "entry, rich": function () {
      this.updateRichData();
    }
  },

  lifetimes: {
    attached() {
      this.updateRichData();
    }
  },

  methods: {
    updateRichData() {
      const entry = this.properties.entry as EntryCardInfo | undefined;
      const entryId = entry?.entry || entry?.entryId;
      const metaParts = [
        entryId ? `#${entryId}` : "",
        entry?.region || ""
      ].filter(Boolean);

      this.setData({
        entryMetaText: metaParts.join(" · "),
        statRows: [
          { label: "总分", value: formatNumber(entry?.totalPoints) },
          { label: "总排名", value: formatRank(entry?.overallRank) },
          { label: "阵容身价", value: formatCurrency(entry?.teamValue) },
          { label: "余额", value: formatCurrency(entry?.bank) }
        ]
      });
    },

    onOpen() {
      this.triggerEvent("open");
    },

    onChange() {
      this.triggerEvent("change");
    }
  }
});
