sap.ui.define(
  ["sap/ui/core/mvc/Controller", "sap/m/MessageToast"],
  function (Controller, MessageToast) {
    "use strict";
    return Controller.extend("com.spike.demandgroupplanner.controller.App", {
      onAdd: function () {
        const oTable = this.byId("table");
        const oBinding = oTable.getBinding("items");
        oBinding.create({ demand_group: "", planner: "" });
      },

      onDelete: function () {
        const oTable = this.byId("table");
        const oItem = oTable.getSelectedItem();
        if (!oItem) {
          MessageToast.show("Select a row to delete first");
          return;
        }
        // delete() only queues the removal in the deferred update group
        // (manifest.json declares demandGroupPlannerGroup as submit: "API").
        // Its own returned promise resolves only once the batch is actually
        // submitted - so submitBatch must be called right after, not chained
        // from that promise's .then(), or the two deadlock on each other.
        const oModel = this.getView().getModel();
        const pDelete = oItem.getBindingContext().delete();
        oModel.submitBatch("demandGroupPlannerGroup");
        pDelete
          .then(() => MessageToast.show("Deleted"))
          .catch((error) => MessageToast.show("Delete failed: " + error.message));
      },

      onSave: function () {
        this.getView()
          .getModel()
          .submitBatch("demandGroupPlannerGroup")
          .then(() => MessageToast.show("Saved"))
          .catch((error) => MessageToast.show("Save failed: " + error.message));
      }
    });
  }
);
