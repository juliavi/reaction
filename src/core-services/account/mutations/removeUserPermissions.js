import SimpleSchema from "simpl-schema";
import ReactionError from "@reactioncommerce/reaction-error";

const inputSchema = new SimpleSchema({
  "accountId": String,
  "userId": String,
  "groups": {
    type: Array, // groupIds that user belongs to
    optional: true,
    defaultValue: []
  },
  "groups.$": {
    type: String
  }
});

/**
 * @name accounts/removeUserPermissions
 * @memberof Mutations/Accounts
 * @summary Removes a group from an account (user) group. This addition to an account  group effectively
 * removes permissions from account (user)
 * @param {Object} context - GraphQL execution context
 * @param {Object} input - Necessary input for mutation. See SimpleSchema.
 * @param {Object} input.groups - groups to append to
 * @param {String} input.accountId - optional decoded ID of account on which entry should be updated, for admins
 * @returns {Promise<Object>} with updated account
 */
export default async function removeUserPermissions(context, input) {
  const itemsToValidate = { accountId: context.accountId, userId: context.userId, groups: input.groups };
  inputSchema.validate(itemsToValidate);
  const { appEvents, collections, userId: userIdFromContext } = context;
  const { Accounts } = collections;
  const { accountId } = context;
  const { groups, shopId } = input;


  const account = await Accounts.findOne({ _id: accountId });

  if (!account) throw new ReactionError("not-found", "No account found");

  if (!context.isInternalCall && userIdFromContext !== accountId) {
    await context.validatePermissions("reaction:accounts", "update", { shopId: account.shopId, legacyRoles: ["reaction-accounts"] });
  }

  await context.validatePermissions("reaction:accounts", "update", { shopId, legacyRoles: ["admin"] });

  // Update the Reaction Accounts collection with new groups info
  // This
  const { value: updatedAccount } = await Accounts.findOneAndUpdate(
    {
      $pull: {
        groups: {
          $in: groups
        }
      }
    },
    {
      multi: true
    }
  );

  if (!updatedAccount) {
    throw new ReactionError("server-error", "Unable to update account groups");
  }

  // Create an array which contains all fields that have changed
  // This is used for search, to determine if we need to re-index
  const updatedFields = ["groups"];

  await appEvents.emit("afterAccountUpdate", {
    account: updatedAccount,
    updatedBy: userIdFromContext,
    updatedFields
  });

  return { account: updatedAccount };
}
