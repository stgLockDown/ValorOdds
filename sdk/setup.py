from setuptools import setup, find_packages

with open("../README.md", "r", encoding="utf-8") as f:
    long_description = f.read()

setup(
    name="glm-sports",
    version="1.0.0",
    author="stgLockDown",
    description="Python SDK for the GLM Sports Analytics API — AI-powered sports analytics, odds analysis, and content generation",
    long_description=long_description,
    long_description_content_type="text/markdown",
    packages=find_packages(),
    python_requires=">=3.8",
    install_requires=[
        "httpx>=0.27.0",
    ],
    classifiers=[
        "Programming Language :: Python :: 3",
        "License :: OSI Approved :: MIT License",
        "Operating System :: OS Independent",
        "Topic :: Software Development :: Libraries :: Python Modules",
        "Topic :: Internet :: WWW/HTTP",
    ],
    keywords="sports analytics ai groq llm api sdk betting odds espn",
)