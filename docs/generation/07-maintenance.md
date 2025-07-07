# Maintenance

## Initial submission

Once your entity types are in good shape, they must be submitted to Corsair for initial review. To request this, clone [FQMTOOL-9](https://folio-org.atlassian.net/browse/FQMTOOL-9), following all of the instructions in the ticket. Once it's ready, move it to `Open` and reach out to Corsair to get it scheduled!

## Ongoing maintenance

Just as your module's schemas evolve, so too will your entity types. Once your repository has been configured, changes will be picked up within a few hours of commits to your repository, creating a pull request against `mod-fqm-manager`. If the changes are significant (anything except translations), your team will get a Slack notification and be requested for reviews on the pull request. Reviews are greatly appreciated, and we welcome comments providing additional context for the changes.

Periodically, your team should examine your entity types and ensure they are as relevant and optimized as possible. This includes verifying indexes, ensuring sources for dropdowns are correct, etc.

## Ongoing testing

Teams should test their entity types as part of their regular testing routines: acceptance tests for tickets which change schemas, bugfests, and so on. We **highly** recommend implementing Karate tests that test your entity types, too.

## Keeping Corsair informed

Please let Corsair know any time:

- You are updating an interface version for your module which FQM relies upon
- You are changing the permissions required for your entity types

This ensures we can keep everything up to date and working smoothly. We don't want to break snapshot! 🚀
