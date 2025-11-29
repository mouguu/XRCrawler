# Contributing to XRCrawler

Thank you for considering contributing to XRCrawler! 🎉

This document provides guidelines and instructions for contributing to the project.

## Code of Conduct

By participating in this project, you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## How to Contribute

### Reporting Bugs

1. **Check existing issues** - Make sure the bug hasn't already been reported
2. **Use the Bug Report template** - This helps us understand the issue better
3. **Provide detailed information**:
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (OS, Node version, etc.)
   - Error logs and screenshots if applicable

### Suggesting Features

1. **Check existing issues** - Your idea might already be discussed
2. **Use the Feature Request template** - Describe the use case and proposed solution
3. **Be specific** - Explain why this feature would be valuable

### Asking Questions

- Use the **Question** issue template for usage questions
- Check the [README.md](README.md) and existing issues first
- Consider opening a Discussion instead if it's a general question

### Submitting Code Changes

#### Development Setup

1. **Fork the repository**

```bash
git clone https://github.com/your-username/XRCrawler.git
cd XRCrawler
```

2. **Install dependencies**

```bash
pnpm install
cd frontend && pnpm install && cd ..
```

3. **Create a feature branch**

```bash
git checkout -b feature/amazing-feature
# or
git checkout -b fix/bug-description
```

4. **Make your changes**

- Write clean, readable code
- Follow existing code style
- Add comments for complex logic
- Update documentation if needed

5. **Run tests**

```bash
pnpm test
```

6. **Test your changes**

```bash
# Start development server
pnpm run dev:fast

# Test CLI commands
pnpm run build
node dist/cli.js --help
```

7. **Commit your changes**

```bash
git add .
git commit -m "feat: add amazing feature"
# or
git commit -m "fix: resolve bug description"
```

**Commit message guidelines:**
- Use conventional commits format: `type: description`
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`
- Keep messages concise but descriptive

8. **Push to your fork**

```bash
git push origin feature/amazing-feature
```

9. **Open a Pull Request**

- Fill out the PR template
- Link related issues
- Describe your changes
- Request review from maintainers

## Code Style

### TypeScript

- Use TypeScript for all new code
- Follow existing patterns and conventions
- Use meaningful variable and function names
- Add JSDoc comments for public APIs

### Code Organization

- Keep functions focused and single-purpose
- Extract reusable logic into utilities
- Follow the existing directory structure:
  - `core/` - Core scraping logic
  - `utils/` - Utility functions
  - `types/` - TypeScript type definitions
  - `config/` - Configuration constants

### Testing

- Add tests for new features
- Ensure all tests pass before submitting
- Write tests that are:
  - Fast
  - Isolated
  - Clear and readable

### Documentation

- Update README.md if adding new features
- Add JSDoc comments for public functions
- Update type definitions if changing APIs
- Keep code comments up to date

## Pull Request Process

1. **Update documentation** - If you change functionality, update the docs
2. **Add tests** - New features should include tests
3. **Ensure tests pass** - All CI checks must pass
4. **Get review** - Wait for maintainer approval
5. **Address feedback** - Make requested changes
6. **Merge** - Maintainers will merge when ready

## Development Guidelines

### Adding New Features

1. **Discuss first** - Open an issue to discuss major features
2. **Keep it focused** - One feature per PR
3. **Backward compatibility** - Don't break existing APIs
4. **Configuration** - Use `config/constants.ts` for configurable values

### Fixing Bugs

1. **Reproduce** - Create a test case that reproduces the bug
2. **Fix** - Implement the fix
3. **Test** - Add tests to prevent regression
4. **Document** - Update docs if behavior changes

### Code Review

- Be respectful and constructive
- Focus on the code, not the person
- Ask questions if something is unclear
- Suggest improvements, don't just point out problems

## Project Structure

```
XRCrawler/
├── core/              # Core scraping engine
├── utils/             # Utility functions
├── types/             # TypeScript definitions
├── config/            # Configuration constants
├── tests/             # Test files
├── frontend/          # React web interface
├── server.ts          # Express server
├── cli.ts             # CLI interface
└── README.md          # Main documentation
```

## Getting Help

- **Documentation**: Check [README.md](README.md)
- **Issues**: Search existing issues
- **Discussions**: Ask questions in Discussions
- **Security**: See [SECURITY.md](.github/SECURITY.md)

## Recognition

Contributors will be:
- Listed in the README (if desired)
- Credited in release notes
- Appreciated by the community! 🙏

## Questions?

If you have questions about contributing, feel free to:
- Open a Discussion
- Ask in an issue
- Reach out to maintainers

Thank you for contributing to XRCrawler! 🚀

