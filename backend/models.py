from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Boolean,
    DateTime,
    ForeignKey,
    Float,
    Integer,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class Profile(Base):
    __tablename__ = "profiles"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
    )
    email: Mapped[str | None] = mapped_column(Text)
    full_name: Mapped[str | None] = mapped_column(Text)
    campaigns_unlocked: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("false"),
    )
    unlocked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    stripe_customer_id: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )


class Template(Base):
    __tablename__ = "templates"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    name: Mapped[str] = mapped_column(Text, nullable=False)
    subject: Mapped[str] = mapped_column(Text, nullable=False)
    body_text: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    campaigns: Mapped[list[Campaign]] = relationship(back_populates="template")


class Campaign(Base):
    __tablename__ = "campaigns"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    template_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("templates.id", ondelete="SET NULL"),
        index=True,
    )
    company: Mapped[str] = mapped_column(Text, nullable=False)
    subject: Mapped[str] = mapped_column(Text, nullable=False)
    body_text: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        server_default=text("'draft'"),
    )
    resume_storage_path: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    template: Mapped[Template | None] = relationship(back_populates="campaigns")
    recipients: Mapped[list[CampaignRecipient]] = relationship(
        back_populates="campaign",
        cascade="all, delete-orphan",
    )


class UserResume(Base):
    """Saved resume PDFs for the dashboard library (Storage path + metadata)."""

    __tablename__ = "user_resumes"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        nullable=False,
        index=True,
    )
    resume_storage_path: Mapped[str] = mapped_column(Text, nullable=False)
    display_name: Mapped[str] = mapped_column(Text, nullable=False)
    file_type: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        server_default=text("'PDF'"),
    )
    byte_size: Mapped[int | None] = mapped_column(BigInteger)
    focus: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        server_default=text("'Unassigned'"),
    )
    used_in_campaigns: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        server_default=text("0"),
    )
    is_default: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        server_default=text("false"),
    )
    status: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        server_default=text("'Ready'"),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    profile: Mapped[ResumeProfile | None] = relationship(
        back_populates="resume",
        cascade="all, delete-orphan",
        uselist=False,
    )


class ResumeProfile(Base):
    __tablename__ = "resume_profiles"

    resume_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("user_resumes.id", ondelete="CASCADE"),
        primary_key=True,
    )
    raw_text: Mapped[str | None] = mapped_column(Text)
    raw_text_hash: Mapped[str | None] = mapped_column(Text)
    parse_status: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        server_default=text("'pending'"),
    )
    parser_version: Mapped[str] = mapped_column(Text, nullable=False)
    parse_error: Mapped[str | None] = mapped_column(Text)
    primary_school_name: Mapped[str | None] = mapped_column(Text)
    primary_school_normalized: Mapped[str | None] = mapped_column(Text)
    primary_major: Mapped[str | None] = mapped_column(Text)
    grad_year: Mapped[int | None] = mapped_column(Integer)
    parsed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    user_confirmed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True)
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
        onupdate=func.now(),
    )

    resume: Mapped[UserResume] = relationship(back_populates="profile")
    skills: Mapped[list[ResumeProfileSkill]] = relationship(
        back_populates="profile",
        cascade="all, delete-orphan",
        order_by="ResumeProfileSkill.position",
    )
    education: Mapped[list[ResumeProfileEducation]] = relationship(
        back_populates="profile",
        cascade="all, delete-orphan",
        order_by="ResumeProfileEducation.position",
    )
    experience: Mapped[list[ResumeProfileExperience]] = relationship(
        back_populates="profile",
        cascade="all, delete-orphan",
        order_by="ResumeProfileExperience.position",
    )
    projects: Mapped[list[ResumeProfileProject]] = relationship(
        back_populates="profile",
        cascade="all, delete-orphan",
        order_by="ResumeProfileProject.position",
    )
    links: Mapped[list[ResumeProfileLink]] = relationship(
        back_populates="profile",
        cascade="all, delete-orphan",
        order_by="ResumeProfileLink.position",
    )


class ResumeProfileSkill(Base):
    __tablename__ = "resume_profile_skills"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    resume_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("resume_profiles.resume_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)

    profile: Mapped[ResumeProfile] = relationship(back_populates="skills")


class ResumeProfileEducation(Base):
    __tablename__ = "resume_profile_education"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    resume_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("resume_profiles.resume_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    school: Mapped[str | None] = mapped_column(Text)
    normalized_school: Mapped[str | None] = mapped_column(Text)
    degree: Mapped[str | None] = mapped_column(Text)
    major: Mapped[str | None] = mapped_column(Text)
    start_year: Mapped[int | None] = mapped_column(Integer)
    end_year: Mapped[int | None] = mapped_column(Integer)
    is_current: Mapped[bool | None] = mapped_column(Boolean)
    confidence: Mapped[float | None] = mapped_column(Float)

    profile: Mapped[ResumeProfile] = relationship(back_populates="education")


class ResumeProfileExperience(Base):
    __tablename__ = "resume_profile_experience"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    resume_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("resume_profiles.resume_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str | None] = mapped_column(Text)
    company: Mapped[str | None] = mapped_column(Text)
    location: Mapped[str | None] = mapped_column(Text)
    start_date: Mapped[str | None] = mapped_column(Text)
    end_date: Mapped[str | None] = mapped_column(Text)
    is_current: Mapped[bool | None] = mapped_column(Boolean)
    description: Mapped[str | None] = mapped_column(Text)
    confidence: Mapped[float | None] = mapped_column(Float)

    profile: Mapped[ResumeProfile] = relationship(back_populates="experience")
    highlights: Mapped[list[ResumeProfileExperienceHighlight]] = relationship(
        back_populates="experience",
        cascade="all, delete-orphan",
        order_by="ResumeProfileExperienceHighlight.position",
    )
    skills: Mapped[list[ResumeProfileExperienceSkill]] = relationship(
        back_populates="experience",
        cascade="all, delete-orphan",
        order_by="ResumeProfileExperienceSkill.position",
    )


class ResumeProfileExperienceHighlight(Base):
    __tablename__ = "resume_profile_experience_highlights"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    experience_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("resume_profile_experience.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    text: Mapped[str] = mapped_column(Text, nullable=False)

    experience: Mapped[ResumeProfileExperience] = relationship(
        back_populates="highlights"
    )


class ResumeProfileExperienceSkill(Base):
    __tablename__ = "resume_profile_experience_skills"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    experience_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("resume_profile_experience.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)

    experience: Mapped[ResumeProfileExperience] = relationship(back_populates="skills")


class ResumeProfileProject(Base):
    __tablename__ = "resume_profile_projects"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    resume_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("resume_profiles.resume_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str | None] = mapped_column(Text)
    description: Mapped[str | None] = mapped_column(Text)
    start_date: Mapped[str | None] = mapped_column(Text)
    end_date: Mapped[str | None] = mapped_column(Text)
    confidence: Mapped[float | None] = mapped_column(Float)

    profile: Mapped[ResumeProfile] = relationship(back_populates="projects")
    skills: Mapped[list[ResumeProfileProjectSkill]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="ResumeProfileProjectSkill.position",
    )
    links: Mapped[list[ResumeProfileProjectLink]] = relationship(
        back_populates="project",
        cascade="all, delete-orphan",
        order_by="ResumeProfileProjectLink.position",
    )


class ResumeProfileProjectSkill(Base):
    __tablename__ = "resume_profile_project_skills"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("resume_profile_projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    name: Mapped[str] = mapped_column(Text, nullable=False)

    project: Mapped[ResumeProfileProject] = relationship(back_populates="skills")


class ResumeProfileProjectLink(Base):
    __tablename__ = "resume_profile_project_links"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("resume_profile_projects.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)

    project: Mapped[ResumeProfileProject] = relationship(back_populates="links")


class ResumeProfileLink(Base):
    __tablename__ = "resume_profile_links"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    resume_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("resume_profiles.resume_id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False)
    url: Mapped[str] = mapped_column(Text, nullable=False)

    profile: Mapped[ResumeProfile] = relationship(back_populates="links")


class CampaignRecipient(Base):
    __tablename__ = "campaign_recipients"
    __table_args__ = (
        UniqueConstraint(
            "campaign_id",
            "email",
            name="campaign_recipients_campaign_id_email_key",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        server_default=text("gen_random_uuid()"),
    )
    campaign_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("campaigns.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    email: Mapped[str] = mapped_column(Text, nullable=False)
    greeting_name: Mapped[str | None] = mapped_column(Text)
    status: Mapped[str] = mapped_column(
        Text,
        nullable=False,
        server_default=text("'discovered'"),
    )
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    campaign: Mapped[Campaign] = relationship(back_populates="recipients")
