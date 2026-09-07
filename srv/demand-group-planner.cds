using { com.spike.demandgroupplanner as db } from '../db/schema';

service DemandGroupPlannerService @(requires: 'authenticated-user') {

  // @Core.Computed on the audit fields carries through from db/schema.cds -
  // a plain, unrenamed projection inherits the underlying entity's element
  // annotations by default.
  entity DemandGroupPlanner as projection on db.DemandGroupPlanner;
}
