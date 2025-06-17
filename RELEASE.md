# Release Process

This document outlines the release process for pure-js-sftp.

## Pre-Release Checklist

- [ ] All tests pass (`npm test`)
- [ ] Code builds successfully (`npm run build`)
- [ ] Documentation is up to date
- [ ] CHANGELOG.md is updated with new changes
- [ ] Version number follows semantic versioning
- [ ] All TypeScript types are properly exported
- [ ] No security vulnerabilities in dependencies

## Release Types

### Patch Release (x.x.X)
- Bug fixes
- Documentation updates
- Performance improvements
- Security patches

### Minor Release (x.X.x)
- New features (backwards compatible)
- New API methods
- Enhanced functionality
- Deprecation warnings

### Major Release (X.x.x)
- Breaking changes
- Removed deprecated features
- API changes requiring code updates
- Major architecture changes

## Release Steps

### 1. Prepare Release
```bash
# Ensure you're on main branch and up to date
git checkout main
git pull origin main

# Run full test suite
npm test

# Build the project
npm run build

# Lint the code
npm run lint
```

### 2. Update Version
```bash
# For patch release
npm version patch

# For minor release
npm version minor

# For major release
npm version major
```

### 3. Update CHANGELOG.md
- Add new version section
- Document all changes, fixes, and new features
- Follow existing format and style
- Include migration notes for breaking changes

### 4. Commit and Tag
```bash
# Commit changelog updates
git add CHANGELOG.md
git commit -m "Update changelog for vX.X.X"

# Push changes and tags
git push origin main
git push origin --tags
```

### 5. Publish to npm
```bash
# Publish to npm registry
npm publish

# Verify publication
npm view pure-js-sftp
```

### 6. Create GitHub Release
- Go to GitHub releases page
- Create new release from the version tag
- Copy changelog content to release notes
- Mark as latest release

## Post-Release Tasks

- [ ] Verify package appears correctly on npmjs.com
- [ ] Test installation in a fresh project
- [ ] Update any dependent projects
- [ ] Announce release on relevant channels
- [ ] Monitor for any immediate issues

## Emergency Releases

For critical security fixes or major bugs:

1. Create hotfix branch from latest release tag
2. Apply minimal fix
3. Run abbreviated testing
4. Release as patch version
5. Merge hotfix back to main

## Version History

- **1.0.0** - Initial release with full SFTP implementation
- **1.0.1** - Documentation and npm display fixes

## Notes

- Always test the published package before announcing
- Keep releases focused and atomic
- Document breaking changes clearly
- Maintain backwards compatibility when possible
- Follow semantic versioning strictly