sap.ui.define(
  ["sap/ui/core/UIComponent", "sap/ui/core/mvc/XMLView"],
  function (UIComponent, XMLView) {
    "use strict";
    return UIComponent.extend("com.spike.demandgroupplanner.Component", {
      metadata: {
        manifest: "json",
        interfaces: ["sap.ui.core.IAsyncContentCreation"]
      },
      createContent: function () {
        return XMLView.create({ viewName: "com.spike.demandgroupplanner.view.App" });
      }
    });
  }
);
