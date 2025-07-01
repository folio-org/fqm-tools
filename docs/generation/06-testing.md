# Testing

To test your changes, you will need to deploy your changes in a Rancher environment.

## Staging

First, checkout `folio-org/mod-fqm-manager` locally and point it to a custom branch. **Custom branches must be prefixed with your team name, e.g. `cool-team/testing` or `cool-team/modcoolness-123`.** Once you have your branch ready, use the `4-stage-changes.ts` script to merge your generated entity types:

```sh
bun scripts/entity-generation/4-stage-changes.ts --base-dir ../path/to/mod-fqm-manager < out/issues.log
```

Once the generated entity types are copied into your `mod-fqm-manager` branch, commit and push your changes:

```sh
# run this in your mod-fqm-manager directory
git add .
git commit -m "a descriptive message"
git push origin cool-team/testing
```

## Deploying

To deploy, use the [`deployModuleFromFeatureBranchEureka` Jenkins job](https://jenkins.ci.folio.org/job/folioDevTools/job/moduleDeployment/job/deployModuleFromFeatureBranchEureka/) ([wiki](https://folio-org.atlassian.net/wiki/x/ZIDFKQ)).

## Testing

Once deployed, your entity types are available in FQM! If `private` is unset or `false` in your configuration, your entity types will be available from the Lists interface. All entity types are available via the [API](https://s3.amazonaws.com/foliodocs/api/folio-query-tool-metadata/s/queryTool.html#tag/fqlQuery), too.

> [!NOTE]
> If you run into issues from generated code, please reach out to Corsair — there may be a bug in the generator! This includes SQL errors from generated `valueGetter`s, casting errors, or anything else that seems non-obvious.
>
> If you have questions, we are always available to help 🚀

## Clean up

Once you are done testing, please make sure to remove your branch:

```sh
git checkout main
git branch -D cool-team/testing
git push origin --delete cool-team/testing
```

Doing this helps keep the repository clean and avoids confusion for other developers.

## Next steps

Congratulations, you are done with the guided tutorial! Next up, check out the other documentation files in this folder, such as the [configuration reference](config-schema.md) and the [field schema reference](field-schema.md). These will help you understand how to customize your entity types and fields further, unlocking the true potential of FQM!
