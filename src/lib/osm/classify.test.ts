import { describe, expect, it } from "vitest";
import { classifyOsm, osmEditorLabel } from "./classify";

describe("classifyOsm", () => {
  it("recognises AI-assisted editors", () => {
    expect(classifyOsm({ created_by: "RapiD 2.8.1" })).toBe("rapid");
    expect(classifyOsm({ created_by: "iD 2.30", imagery_used: "MapWithAI Roads" })).toBe("mapwithai");
    expect(classifyOsm({ created_by: "Osmose-Editor" })).toBe("osmose");
    expect(classifyOsm({ created_by: "JOSM/1.5 (19000 en)", comment: "AI-assisted building import" })).toBe("other-ai");
  });

  it("recognises bots by editor or username", () => {
    expect(classifyOsm({ created_by: "osm-bulk-upload/upload.py" }, "SomeBot")).toBe("bot");
    expect(classifyOsm({ created_by: "custom_bot 1.0" })).toBe("bot");
  });

  it("returns null for ordinary human editors", () => {
    expect(classifyOsm({ created_by: "StreetComplete 63.1", comment: "Specify crossings" }, "WhenThe")).toBeNull();
    expect(classifyOsm({ created_by: "iD 2.30.0" })).toBeNull();
    expect(classifyOsm(undefined)).toBeNull();
  });

  it("labels editors without versions", () => {
    expect(osmEditorLabel("StreetComplete 63.1")).toBe("StreetComplete");
    expect(osmEditorLabel("RapiD 2.8.1")).toBe("RapiD");
    expect(osmEditorLabel(null)).toBe("unknown");
  });
});
